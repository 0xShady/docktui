import type blessed from 'neo-blessed';
import {
  killContainer,
  listContainers,
  removeContainer,
  restartContainer,
  startContainer,
  stopContainer,
} from '@docker/containers';
import type { ContainerInfo, ContainerStats } from '@models/docker';
import { isActive, type MemDisplay } from '@utils/status';
import { openExternalShell } from '@utils/external-terminal';
import { ContainerList } from '@ui/containers/container-list';
import type { RowStats } from '@ui/containers/container-list';
import { ContainerDetail } from '@ui/containers/container-detail';
import { ConfirmDialog } from '@ui/containers/confirm-dialog';
import { LogViewer } from '@ui/containers/log-viewer';

import type { Dims } from '@ui/widgets';

type ErrorHandler = (message: string) => void;
type ContainerSelectHandler = (container: ContainerInfo | null) => void;

export class ContainersTab {
  private screen: blessed.Widgets.Screen;
  private containerList: ContainerList;
  private containerDetail: ContainerDetail;
  private confirmDialog: ConfirmDialog;
  private logViewer: LogViewer;

  private containers: ContainerInfo[] = [];
  private selectedIndex = 0;
  private active = false;
  private statsCache = new Map<string, ContainerStats>();

  private errorHandlers: ErrorHandler[] = [];
  private containerSelectHandlers: ContainerSelectHandler[] = [];
  private detailOpenHandlers: (() => void)[] = [];
  private logOpenHandlers: (() => void)[] = [];
  private logFollowChangeHandlers: ((following: boolean) => void)[] = [];

  private readonly handleEnter = () => {
    if (!this.active || this.isOverlayOpen()) return;
    const c = this.containerList.getSelected();
    if (!c) return;
    this.containerDetail.show(c, this.statsCache.get(c.id));
    this.detailOpenHandlers.forEach((h) => h());
  };

  private readonly handleL = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c) return;
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    this.logViewer.show(c);
    this.logOpenHandlers.forEach((h) => h());
  };

  private confirmAndRun(title: string, message: string, danger: boolean, action: () => Promise<void>): void {
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    this.confirmDialog.show({
      title,
      message,
      danger,
      onConfirm: () => {
        void action()
          .then(() => this.refresh())
          .catch((err: unknown) => this.emitError(err))
          .finally(() => {
            this.containerList.focus();
            this.screen.render();
          });
      },
      onCancel: () => {
        this.containerList.focus();
        this.screen.render();
      },
    });
  }

  private readonly handleS = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c || !isActive(c.status)) return;
    this.confirmAndRun('Stop container?', `${c.name} will be stopped.`, true, () => stopContainer(c.id));
  };

  private readonly handleR = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c || !isActive(c.status)) return;
    this.confirmAndRun('Restart container?', `${c.name} will be restarted.`, false, () =>
      restartContainer(c.id),
    );
  };

  private readonly handleK = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c || !isActive(c.status)) return;
    this.confirmAndRun('Kill container?', `${c.name} will be killed (SIGKILL).`, true, () =>
      killContainer(c.id),
    );
  };

  private readonly handleShiftS = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c) {
      this.emitError('No container selected');
      return;
    }
    if (isActive(c.status)) {
      this.emitError(`${c.name} is already ${c.status}`);
      return;
    }
    if (c.status !== 'exited' && c.status !== 'created') {
      this.emitError(`Cannot start ${c.name}: status is ${c.status}`);
      return;
    }
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    void startContainer(c.id)
      .then(() => this.refresh())
      .catch((err: unknown) => this.emitError(err))
      .finally(() => {
        this.containerList.focus();
        this.screen.render();
      });
  };

  private readonly handleD = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c || isActive(c.status)) return;
    this.confirmAndRun('Remove container?', `${c.name} will be permanently removed.`, true, () =>
      removeContainer(c.id),
    );
  };

  private readonly handleX = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c || c.status !== 'running') {
      if (c) this.emitError(`Cannot exec into ${c.name}: container is not running`);
      return;
    }
    if (this.containerDetail.isVisible()) this.containerDetail.hide();

    const result = openExternalShell(c.id);
    if (!result.ok) {
      this.emitError(result.error ?? `Failed to open external terminal for ${c.name}`);
    }
    this.screen.render();
  };

  constructor(screen: blessed.Widgets.Screen, dims: Dims) {
    this.screen = screen;

    this.containerList = new ContainerList(screen, dims);
    this.containerDetail = new ContainerDetail(screen, dims);
    this.confirmDialog = new ConfirmDialog(screen);
    this.logViewer = new LogViewer(screen, dims);

    this.containerList.on('select', (container) => {
      const idx = this.containers.findIndex((c) => c.id === container.id);
      if (idx >= 0) this.selectedIndex = idx;
    });

    this.containerList.on('navigate', (container) => {
      this.containerSelectHandlers.forEach((h) => h(container));
    });

    this.containerDetail.on('close', () => {
      this.containerList.focus();
      this.emitSelect();
      this.screen.render();
    });

    this.logViewer.on('close', () => {
      this.containerList.focus();
      this.emitSelect();
      this.screen.render();
    });

    this.logViewer.on('follow-change', (following) => {
      this.logFollowChangeHandlers.forEach((h) => h(following));
    });

    this.containerList.hide();
  }

  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'select', handler: ContainerSelectHandler): void;
  on(event: 'detail-open' | 'log-open', handler: () => void): void;
  on(event: 'log-follow-change', handler: (following: boolean) => void): void;
  on(
    event: 'error' | 'select' | 'detail-open' | 'log-open' | 'log-follow-change',
    handler: ErrorHandler | ContainerSelectHandler | (() => void) | ((following: boolean) => void),
  ): void {
    if (event === 'error') this.errorHandlers.push(handler as ErrorHandler);
    if (event === 'select') this.containerSelectHandlers.push(handler as ContainerSelectHandler);
    if (event === 'detail-open') this.detailOpenHandlers.push(handler as () => void);
    if (event === 'log-open') this.logOpenHandlers.push(handler as () => void);
    if (event === 'log-follow-change') {
      this.logFollowChangeHandlers.push(handler as (following: boolean) => void);
    }
  }

  show(): void {
    this.active = true;
    this.containerList.show();
    this.containerList.focus();

    this.screen.key(['enter'], this.handleEnter);
    this.screen.key(['l'], this.handleL);
    this.screen.key(['s'], this.handleS);
    this.screen.key(['r'], this.handleR);
    this.screen.key(['k'], this.handleK);
    this.screen.key(['S-s'], this.handleShiftS);
    this.screen.key(['d'], this.handleD);
    this.screen.key(['x'], this.handleX);

    this.emitSelect();
  }

  hide(): void {
    this.active = false;
    this.containerList.hide();
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    if (this.logViewer.isVisible()) this.logViewer.hide();
    if (this.confirmDialog.isVisible()) this.confirmDialog.hide();

    this.screen.removeKey('enter', this.handleEnter);
    this.screen.removeKey('l', this.handleL);
    this.screen.removeKey('s', this.handleS);
    this.screen.removeKey('r', this.handleR);
    this.screen.removeKey('k', this.handleK);
    this.screen.removeKey('S-s', this.handleShiftS);
    this.screen.removeKey('d', this.handleD);
    this.screen.removeKey('x', this.handleX);

    this.containerSelectHandlers.forEach((h) => h(null));
  }

  showLoading(): void {
    this.containerList.showLoading();
  }

  isOverlayOpen(): boolean {
    return this.isModalOpen() || this.containerDetail.isVisible();
  }

  isConfirmOpen(): boolean {
    return this.confirmDialog.isVisible();
  }

  getSelected(): ContainerInfo | null {
    return this.containerList.getSelected();
  }

  cleanup(): void {
    if (this.logViewer.isVisible()) this.logViewer.hide();
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    if (this.confirmDialog.isVisible()) this.confirmDialog.hide();
  }

  setMemDisplay(display: MemDisplay): void {
    this.containerList.setMemDisplay(display);
    this.refreshListStats();
  }

  refreshListStats(): void {
    const cursorPos = this.containerList.getSelectedIndex();

    const listStats = new Map<string, RowStats>();
    for (const c of this.containers) {
      const s = this.statsCache.get(c.id);
      if (s) listStats.set(c.id, s);
    }
    this.containerList.setData(this.containers, listStats);

    this.containerList.list.select(Math.min(cursorPos, Math.max(0, this.containers.length - 1)));
  }

  setData(containers: ContainerInfo[]): void {
    const cursorId = this.containerList.getSelected()?.id ?? this.containers[this.selectedIndex]?.id;

    this.containers = containers;

    if (cursorId) {
      const newIdx = containers.findIndex((c) => c.id === cursorId);
      this.selectedIndex = newIdx >= 0 ? newIdx : 0;
    }
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, containers.length - 1));

    const listStats = new Map<string, RowStats>();
    for (const c of containers) {
      const s = this.statsCache.get(c.id);
      if (s) listStats.set(c.id, s);
    }

    const targetIdx = this.selectedIndex;
    this.containerList.setData(containers, listStats);
    this.containerList.list.select(targetIdx);

    if (this.containerDetail.isVisible()) {
      const detailId = this.containerDetail.getContainerId();
      if (detailId) {
        const updated = containers.find((c) => c.id === detailId);
        if (updated) {
          this.containerDetail.update(updated, this.statsCache.get(detailId));
        } else {
          this.containerDetail.hide();
          this.containerList.focus();
        }
      }
    }

    this.emitSelect();
  }

  updateStats(id: string, stats: ContainerStats): void {
    this.statsCache.set(id, stats);

    if (this.containerDetail.isVisible() && this.containerDetail.getContainerId() === id) {
      const container = this.containers.find((c) => c.id === id);
      if (container) this.containerDetail.update(container, stats);
    }
  }

  async refresh(): Promise<void> {
    const containers = await listContainers();
    this.setData(containers);
  }

  private isModalOpen(): boolean {
    return this.confirmDialog.isVisible() || this.logViewer.isVisible();
  }

  /** Container targeted by list/detail actions (detail takes precedence when open). */
  private getActionTarget(): ContainerInfo | null {
    if (this.containerDetail.isVisible()) {
      const id = this.containerDetail.getContainerId();
      if (id) return this.containers.find((c) => c.id === id) ?? null;
    }
    return this.containerList.getSelected();
  }

  private emitSelect(): void {
    const container = this.containerList.getSelected();
    this.containerSelectHandlers.forEach((h) => h(container));
  }

  private emitError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.errorHandlers.forEach((h) => h(msg));
  }
}

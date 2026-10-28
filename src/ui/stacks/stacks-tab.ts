import blessed from 'neo-blessed';
import {
  killContainer,
  listContainers,
  removeContainer,
  restartContainer,
  startContainer,
  stopContainer,
} from '@docker/containers';
import { runCompose } from '@docker/compose';
import type { ContainerInfo, ContainerStats } from '@models/docker';
import { C } from '@theme';
import { COMPOSE_VERB_LABEL, type ComposeProject, type ComposeVerb } from '@utils/compose';
import { groupIntoStacks, isDown, type Stack } from '@utils/stacks';
import { isActive, type MemDisplay } from '@utils/status';
import { openExternalShell } from '@utils/external-terminal';
import { ContainerDetail } from '@ui/containers/container-detail';
import { ConfirmDialog } from '@ui/containers/confirm-dialog';
import { LogViewer } from '@ui/containers/log-viewer';
import { StackTree, type StackTreeSelection } from '@ui/stacks/stack-tree';
import type { Dims } from '@ui/widgets';

type ErrorHandler = (message: string) => void;
type MessageHandler = (message: string, color: 'green' | 'normal', duration: number) => void;
type NavigateHandler = (sel: StackTreeSelection) => void;
type StackUpdateHandler = (stacks: Stack[]) => void;
type DetailOpenHandler = () => void;
type LogOpenHandler = () => void;
type LogFollowHandler = (following: boolean) => void;

export class StacksTab {
  private screen: blessed.Widgets.Screen;
  private wrapper: blessed.Widgets.BoxElement;
  private filterBox: blessed.Widgets.TextboxElement;

  private tree: StackTree;
  private containerDetail: ContainerDetail;
  private confirmDialog: ConfirmDialog;
  private logViewer: LogViewer;

  private containers: ContainerInfo[] = [];
  private stacks: Stack[] = [];
  private statsCache = new Map<string, ContainerStats>();
  private active = false;
  private filterOpen = false;
  private composeRunning = new Set<string>();
  private knownProjects = new Map<string, ComposeProject>();

  private errorHandlers: ErrorHandler[] = [];
  private messageHandlers: MessageHandler[] = [];
  private navigateHandlers: NavigateHandler[] = [];
  private stackUpdateHandlers: StackUpdateHandler[] = [];
  private detailOpenHandlers: DetailOpenHandler[] = [];
  private logOpenHandlers: LogOpenHandler[] = [];
  private logFollowHandlers: LogFollowHandler[] = [];

  constructor(screen: blessed.Widgets.Screen, dims: Dims) {
    this.screen = screen;

    this.wrapper = blessed.box({
      parent: screen,
      top: dims.top,
      left: dims.left,
      width: dims.width,
      height: dims.height,
      hidden: true,
    });

    this.tree = new StackTree(this.wrapper, {
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
    });

    // Appended after the tree so the filter input draws on top when shown.
    this.filterBox = blessed.textbox({
      parent: this.wrapper,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      inputOnFocus: true,
      tags: true,
      style: { bg: C.panel, fg: C.fg },
      hidden: true,
    });

    this.containerDetail = new ContainerDetail(screen, dims);
    this.confirmDialog = new ConfirmDialog(screen);
    this.logViewer = new LogViewer(screen, dims);

    this.tree.on('navigate', (sel) => this.navigateHandlers.forEach((h) => h(sel)));

    this.containerDetail.on('close', () => {
      this.tree.focus();
      this.screen.render();
    });

    this.logViewer.on('close', () => {
      this.tree.focus();
      this.screen.render();
    });

    this.logViewer.on('follow-change', (f) => this.logFollowHandlers.forEach((h) => h(f)));

    this.filterBox.on('submit', (value: string) => {
      this.applyFilter(value ?? '');
      this.exitFilter();
    });

    this.filterBox.on('cancel', () => {
      this.applyFilter('');
      this.exitFilter();
    });
  }

  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'message', handler: MessageHandler): void;
  on(event: 'navigate', handler: NavigateHandler): void;
  on(event: 'stack-update', handler: StackUpdateHandler): void;
  on(event: 'detail-open', handler: DetailOpenHandler): void;
  on(event: 'log-open', handler: LogOpenHandler): void;
  on(event: 'log-follow-change', handler: LogFollowHandler): void;
  on(
    event:
      | 'error'
      | 'message'
      | 'navigate'
      | 'stack-update'
      | 'detail-open'
      | 'log-open'
      | 'log-follow-change',
    handler:
      | ErrorHandler
      | MessageHandler
      | NavigateHandler
      | StackUpdateHandler
      | DetailOpenHandler
      | LogOpenHandler
      | LogFollowHandler,
  ): void {
    if (event === 'error') this.errorHandlers.push(handler as ErrorHandler);
    else if (event === 'message') this.messageHandlers.push(handler as MessageHandler);
    else if (event === 'navigate') this.navigateHandlers.push(handler as NavigateHandler);
    else if (event === 'stack-update') this.stackUpdateHandlers.push(handler as StackUpdateHandler);
    else if (event === 'detail-open') this.detailOpenHandlers.push(handler as DetailOpenHandler);
    else if (event === 'log-open') this.logOpenHandlers.push(handler as LogOpenHandler);
    else this.logFollowHandlers.push(handler as LogFollowHandler);
  }

  show(): void {
    this.active = true;
    this.wrapper.show();
    this.tree.focus();

    this.screen.key(['enter'], this.handleEnter);
    this.screen.key(['left'], this.handleLeft);
    this.screen.key(['right'], this.handleRight);
    this.screen.key(['l'], this.handleL);
    this.screen.key(['s'], this.handleS);
    this.screen.key(['r'], this.handleR);
    this.screen.key(['k'], this.handleK);
    this.screen.key(['S-s'], this.handleShiftS);
    this.screen.key(['d'], this.handleD);
    this.screen.key(['x'], this.handleX);
    this.screen.key(['/'], this.handleSlash);
    this.screen.key(['u'], this.handleU);
    this.screen.key(['p'], this.handleP);
    this.screen.key(['S-b'], this.handleShiftB);

    this.emitNavigate();
  }

  hide(): void {
    this.active = false;
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    if (this.logViewer.isVisible()) this.logViewer.hide();
    if (this.confirmDialog.isVisible()) this.confirmDialog.hide();
    if (this.filterOpen) this.exitFilter();
    this.wrapper.hide();

    this.screen.removeKey('enter', this.handleEnter);
    this.screen.removeKey('left', this.handleLeft);
    this.screen.removeKey('right', this.handleRight);
    this.screen.removeKey('l', this.handleL);
    this.screen.removeKey('s', this.handleS);
    this.screen.removeKey('r', this.handleR);
    this.screen.removeKey('k', this.handleK);
    this.screen.removeKey('S-s', this.handleShiftS);
    this.screen.removeKey('d', this.handleD);
    this.screen.removeKey('x', this.handleX);
    this.screen.removeKey('/', this.handleSlash);
    this.screen.removeKey('u', this.handleU);
    this.screen.removeKey('p', this.handleP);
    this.screen.removeKey('S-b', this.handleShiftB);

    this.navigateHandlers.forEach((h) => h(null));
  }

  showLoading(): void {
    this.tree.showLoading();
  }

  isOverlayOpen(): boolean {
    return this.isModalOpen() || this.containerDetail.isVisible();
  }

  isConfirmOpen(): boolean {
    return this.confirmDialog.isVisible();
  }

  isFilterOpen(): boolean {
    return this.filterOpen;
  }

  getSelected(): StackTreeSelection {
    return this.tree.getSelected();
  }

  jumpToStack(stackId: string): void {
    this.tree.jumpToStack(stackId);
  }

  getAggregateStats(): { cpuPercent: number; memUsageMB: number } {
    let cpu = 0;
    let mem = 0;
    for (const c of this.containers) {
      if (!isActive(c.status)) continue;
      const s = this.statsCache.get(c.id);
      if (s) {
        cpu += s.cpuPercent;
        mem += s.memUsageMB;
      }
    }
    return { cpuPercent: cpu, memUsageMB: mem };
  }

  cleanup(): void {
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    if (this.logViewer.isVisible()) this.logViewer.hide();
    if (this.confirmDialog.isVisible()) this.confirmDialog.hide();
  }

  setData(containers: ContainerInfo[]): void {
    this.containers = containers;
    this.stacks = groupIntoStacks(containers, [...this.knownProjects.values()]);
    for (const s of this.stacks) {
      if (s.compose) this.knownProjects.set(s.compose.name, s.compose);
    }
    this.tree.setData(this.stacks, this.statsCache);

    if (this.containerDetail.isVisible()) {
      const id = this.containerDetail.getContainerId();
      if (id) {
        const updated = containers.find((c) => c.id === id);
        if (updated) this.containerDetail.update(updated, this.statsCache.get(id));
        else {
          this.containerDetail.hide();
          this.tree.focus();
        }
      }
    }

    this.stackUpdateHandlers.forEach((h) => h(this.stacks));
    this.emitNavigate();
  }

  updateStats(id: string, stats: ContainerStats): void {
    this.statsCache.set(id, stats);
    if (this.containerDetail.isVisible() && this.containerDetail.getContainerId() === id) {
      const container = this.containers.find((c) => c.id === id);
      if (container) this.containerDetail.update(container, stats);
    }
  }

  refreshStats(): void {
    this.tree.setData(this.stacks, this.statsCache);
  }

  setMemDisplay(display: MemDisplay): void {
    this.tree.setMemDisplay(display);
  }

  redraw(): void {
    this.tree.redraw();
  }

  async refresh(): Promise<void> {
    const containers = await listContainers();
    this.setData(containers);
  }

  private emitNavigate(): void {
    this.navigateHandlers.forEach((h) => h(this.tree.getSelected()));
  }

  private emitError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.errorHandlers.forEach((h) => h(msg));
  }

  private isModalOpen(): boolean {
    return this.confirmDialog.isVisible() || this.logViewer.isVisible() || this.isFilterOpen();
  }

  private applyFilter(value: string): void {
    this.tree.setFilter(value.trim());
    this.screen.render();
  }

  private exitFilter(): void {
    this.filterOpen = false;
    this.filterBox.hide();
    this.filterBox.setValue('');
    this.tree.focus();
    this.screen.render();
  }

  private readonly handleSlash = () => {
    if (!this.active || this.isOverlayOpen()) return;
    this.filterOpen = true;
    this.filterBox.setValue(this.tree.getFilter());
    this.filterBox.show();
    this.filterBox.focus();
    this.screen.render();
  };

  private readonly handleEnter = () => {
    if (!this.active || this.isOverlayOpen()) return;
    const sel = this.tree.getSelected();
    if (!sel) return;
    if (sel.kind === 'stack') {
      this.tree.toggleExpansion();
      return;
    }
    this.containerDetail.show(sel.container, this.statsCache.get(sel.container.id));
    this.detailOpenHandlers.forEach((h) => h());
  };

  private readonly handleLeft = () => {
    if (!this.active || this.isOverlayOpen()) return;
    this.tree.collapseSelected();
    this.screen.render();
  };

  private readonly handleRight = () => {
    if (!this.active || this.isOverlayOpen()) return;
    this.tree.expandSelected();
    this.screen.render();
  };

  private readonly handleL = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c) return;
    if (this.containerDetail.isVisible()) this.containerDetail.hide();
    this.logViewer.show(c);
    this.logOpenHandlers.forEach((h) => h());
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

  private readonly handleS = () => {
    if (!this.active || this.isModalOpen()) return;
    const c = this.getActionTarget();
    if (!c || !isActive(c.status)) return;
    this.confirmAndRun('Stop container?', `${c.name} will be stopped.`, true, () => stopContainer(c.id));
  };

  private readonly handleR = () => {
    if (!this.active || this.isModalOpen()) return;
    if (this.getSelectedStack()) {
      this.runStackVerb('restart');
      return;
    }
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
    if (!c) return;
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
        this.tree.focus();
        this.screen.render();
      });
  };

  private readonly handleD = () => {
    if (!this.active || this.isModalOpen()) return;
    if (this.getSelectedStack()) {
      this.runStackVerb('down');
      return;
    }
    const c = this.getActionTarget();
    if (!c || isActive(c.status)) return;
    this.confirmAndRun('Remove container?', `${c.name} will be permanently removed.`, true, () =>
      removeContainer(c.id),
    );
  };

  private readonly handleU = () => {
    if (!this.active || this.isModalOpen()) return;
    this.runStackVerb('up');
  };

  private readonly handleP = () => {
    if (!this.active || this.isModalOpen()) return;
    this.runStackVerb('pull');
  };

  private readonly handleShiftB = () => {
    if (!this.active || this.isModalOpen()) return;
    this.runStackVerb('build');
  };

  private getSelectedStack(): Stack | null {
    if (this.containerDetail.isVisible()) return null;
    const sel = this.tree.getSelected();
    return sel?.kind === 'stack' ? sel.stack : null;
  }

  private runStackVerb(verb: ComposeVerb): void {
    const stack = this.getSelectedStack();
    if (!stack) return;
    const project = stack.compose;
    if (!project) {
      this.emitError(
        `${stack.id}: its containers carry no Compose labels, so docktui can't run compose for it`,
      );
      return;
    }
    if (isDown(stack) && (verb === 'down' || verb === 'restart')) {
      this.emitError(`${project.name} is already down`);
      return;
    }
    if (this.composeRunning.has(project.name)) {
      this.emitError(`docker compose is already running for ${project.name}`);
      return;
    }

    const label = COMPOSE_VERB_LABEL[verb];
    const run = () => {
      this.composeRunning.add(project.name);
      this.emitMessage(`docker compose ${label} · ${project.name}…`, 'normal', 10 * 60 * 1000);
      void runCompose(project, verb)
        .then(() => {
          this.emitMessage(`docker compose ${label} · ${project.name}: done`, 'green', 3000);
          return this.refresh();
        })
        .catch((err: unknown) => this.emitError(err))
        .finally(() => {
          this.composeRunning.delete(project.name);
          this.tree.focus();
          this.screen.render();
        });
    };

    if (verb !== 'down') {
      run();
      return;
    }
    this.confirmDialog.show({
      title: 'Compose down?',
      message: `docker compose down stops and removes the containers and networks of ${project.name}. Volumes are kept.`,
      danger: true,
      onConfirm: run,
      onCancel: () => {
        this.tree.focus();
        this.screen.render();
      },
    });
  }

  private emitMessage(message: string, color: 'green' | 'normal', duration: number): void {
    this.messageHandlers.forEach((h) => h(message, color, duration));
  }

  /** Container targeted by tree/detail actions (detail takes precedence when open). */
  private getActionTarget(): ContainerInfo | null {
    if (this.containerDetail.isVisible()) {
      const id = this.containerDetail.getContainerId();
      if (id) return this.containers.find((c) => c.id === id) ?? null;
    }
    const sel = this.tree.getSelected();
    if (!sel || sel.kind !== 'service') return null;
    return sel.container;
  }

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
            this.tree.focus();
            this.screen.render();
          });
      },
      onCancel: () => {
        this.tree.focus();
        this.screen.render();
      },
    });
  }
}

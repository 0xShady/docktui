import blessed from 'neo-blessed';
import type { ContainerInfo, ContainerStats } from '@models/docker';
import { C, t } from '@theme';
import { humanSizeMB, truncate } from '@utils/format';
import { colorByStatus, cpuColor, isActive, memColor, statusLabel } from '@utils/status';
import { createHeaderBar, type Dims } from '@ui/widgets';

const BAR_WIDTH = 20;

type CloseHandler = () => void;

export class ContainerDetail {
  private screen: blessed.Widgets.Screen;
  private wrapper: blessed.Widgets.BoxElement;
  private headerBox: blessed.Widgets.BoxElement;
  readonly box: blessed.Widgets.BoxElement;

  private container: ContainerInfo | null = null;
  private lastStats: ContainerStats | undefined;
  private envExpanded = false;
  private visible = false;
  private closeHandlers: CloseHandler[] = [];

  private readonly handleClose = () => {
    if (!this.visible) return;
    this.hide();
    this.closeHandlers.forEach((h) => h());
  };

  private readonly handleE = () => {
    if (!this.visible || !this.container) return;
    this.envExpanded = !this.envExpanded;
    this.render();
    this.screen.render();
  };

  constructor(screen: blessed.Widgets.Screen, dims: Dims) {
    this.screen = screen;

    this.wrapper = blessed.box({
      parent: screen,
      top: dims.top,
      left: dims.left,
      width: dims.width,
      height: dims.height,
      style: { bg: C.bg },
      hidden: true,
    });

    this.headerBox = createHeaderBar(this.wrapper);

    this.box = blessed.box({
      parent: this.wrapper,
      top: 1,
      left: 0,
      height: '100%-1',
      width: '100%',
      scrollable: true,
      keys: true,
      mouse: true,
      tags: true,
      alwaysScroll: true,
      scrollbar: { ch: '│', style: { fg: C.comment } },
      style: { fg: C.fg, bg: C.bg },
      padding: { left: 2, right: 2 },
    });
  }

  on(event: 'close', handler: CloseHandler): void {
    if (event === 'close') this.closeHandlers.push(handler);
  }

  show(container: ContainerInfo, stats?: ContainerStats): void {
    this.container = container;
    if (stats !== undefined) this.lastStats = stats;
    this.envExpanded = false;
    this.visible = true;

    this.render();
    this.updateHeader();
    this.wrapper.show();
    this.box.focus();

    this.screen.key(['e'], this.handleE);
    this.screen.key(['escape'], this.handleClose);

    this.screen.render();
  }

  hide(): void {
    this.visible = false;
    this.wrapper.hide();

    this.screen.removeKey('e', this.handleE);
    this.screen.removeKey('escape', this.handleClose);

    this.screen.render();
  }

  update(container: ContainerInfo, stats?: ContainerStats): void {
    this.container = container;
    if (stats !== undefined) this.lastStats = stats;
    if (this.visible) {
      this.render();
      this.updateHeader();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  getContainerId(): string | null {
    return this.container?.id ?? null;
  }

  private updateHeader(): void {
    if (!this.container) return;
    this.headerBox.setContent(` ${t.purple('DETAIL')} — ${t.fg(this.container.name)}`);
  }

  private render(): void {
    if (!this.container) return;
    this.box.setContent(this.buildContent(this.container, this.lastStats));
  }

  private buildContent(c: ContainerInfo, stats?: ContainerStats): string {
    const lines: string[] = [];

    lines.push(`{bold}${t.purple(c.name)}{/bold}  ${t.comment(`${c.image} · ${c.id.slice(0, 12)}`)}`);
    lines.push(colorByStatus(c, `● ${statusLabel(c)}`));
    lines.push('');

    lines.push(`${t.comment('Uptime:')}   ${colorByStatus(c, c.uptime)}`);
    lines.push(`${t.comment('Restart:')}  ${c.restartPolicy}`);
    lines.push(`${t.comment('PIDs:')}     ${c.status === 'running' ? String(c.pids) : t.comment('—')}`);

    if (c.ports.length > 0) {
      lines.push('');
      lines.push(t.comment('Ports:'));
      for (const p of c.ports) lines.push(`  ${t.pink(p)}`);
    }

    if (c.networks.length > 0) {
      lines.push('');
      const info = c.ip ? `${c.networks[0]} · ${c.ip}` : c.networks[0];
      lines.push(`${t.comment('Network:')}  ${t.cyan(info)}`);
      for (const n of c.networks.slice(1)) lines.push(`           ${t.cyan(n)}`);
    }

    if (stats && c.status === 'running') {
      lines.push('');
      lines.push(this.cpuBar(stats.cpuPercent));
      lines.push(this.memBar(stats.memPercent, stats.memUsageMB, stats.memLimitMB));
      lines.push(this.diskLine(stats.diskReadMB, stats.diskWriteMB));
    }

    if (c.mounts.length > 0) {
      lines.push('');
      lines.push(t.comment('MOUNTS'));
      for (const m of c.mounts) {
        lines.push(t.comment(`${m.source} → ${m.destination} (${m.rw ? 'rw' : 'ro'})`));
      }
    }

    lines.push('');
    const arrow = this.envExpanded ? '▼' : '▶';
    lines.push(t.comment(`ENV (${c.env.length}) ${arrow}  — press e to toggle`));
    if (this.envExpanded) {
      for (const entry of c.env) {
        const eq = entry.indexOf('=');
        if (eq >= 0) {
          lines.push(t.yellow(`${entry.slice(0, eq)}=${truncate(entry.slice(eq + 1), 55)}`));
        } else {
          lines.push(t.yellow(entry));
        }
      }
    }

    lines.push('');
    lines.push(this.actionsLine(c));

    return lines.join('\n');
  }

  private cpuBar(cpu: number): string {
    const filled = Math.min(BAR_WIDTH, Math.round((cpu / 100) * BAR_WIDTH));
    const color = cpuColor(cpu);
    const bar = `[${color('█'.repeat(filled))}${t.comment('░'.repeat(BAR_WIDTH - filled))}]`;
    return `${t.comment('CPU')}    ${bar} ${color(`${cpu.toFixed(1)}%`)}`;
  }

  private memBar(mem: number, usageMB: number, limitMB: number): string {
    const filled = Math.min(BAR_WIDTH, Math.round((mem / 100) * BAR_WIDTH));
    const color = memColor(mem);
    const bar = `[${color('█'.repeat(filled))}${t.comment('░'.repeat(BAR_WIDTH - filled))}]`;
    const label = `(${humanSizeMB(usageMB)} / ${humanSizeMB(limitMB)})`;
    return `${t.comment('MEM')}    ${bar} ${color(`${mem.toFixed(1)}%`)} ${t.comment(label)}`;
  }

  private diskLine(readMB: number, writeMB: number): string {
    return `${t.comment('DISK')}   ${t.comment('R:')}${t.cyan(humanSizeMB(readMB))}  ${t.comment('W:')}${t.orange(humanSizeMB(writeMB))}`;
  }

  private actionsLine(c: ContainerInfo): string {
    if (isActive(c.status)) {
      return `  ${t.red('[s] Stop')}  ${t.green('[r] Restart')}  ${t.orange('[K] Kill')}  ${t.purple('[x] Shell')}  ${t.cyan('[l] Logs')}  ${t.yellow('[e] Env')}  ${t.comment('Esc close')}`;
    }
    return `  ${t.green('[S] Start')}  ${t.red('[d] Remove')}  ${t.cyan('[l] Logs')}  ${t.yellow('[e] Env')}  ${t.comment('Esc close')}`;
  }
}

import { createRequire } from 'node:module';
import blessed from 'neo-blessed';
import { C, t } from '@theme';
import { humanSizeMB, truncateMiddle, visualLength } from '@utils/format';

export interface TopBarCounters {
  running: number;
  errored: number;
  stopped: number;
}

export interface TopBarStats {
  cpuPercent: number;
  memUsageMB: number;
}

const pkg = createRequire(__filename)('../../package.json') as { version: string };
const VERSION = pkg.version;
const SEP = '   ';

export class TopBar {
  readonly box: blessed.Widgets.BoxElement;

  private socketPath = '';
  private dockerVersion = '';
  private counters: TopBarCounters = { running: 0, errored: 0, stopped: 0 };
  private stats: TopBarStats | null = null;

  constructor(screen: blessed.Widgets.Screen) {
    this.box = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: { bg: C.bg, fg: C.fg },
    });
  }

  setSocketPath(p: string): void {
    this.socketPath = p;
    this.render();
  }

  setDockerVersion(v: string): void {
    this.dockerVersion = v;
    this.render();
  }

  setCounters(c: TopBarCounters): void {
    this.counters = c;
    this.render();
  }

  setStats(s: TopBarStats | null): void {
    this.stats = s;
    this.render();
  }

  render(): void {
    const width = Number(this.box.width) || 80;
    const right = this.buildRight(width);
    const left = this.buildLeft(width, visualLength(right));
    const gap = Math.max(1, width - visualLength(left) - visualLength(right));
    this.box.setContent(left + ' '.repeat(gap) + right);
  }

  private buildLeft(width: number, rightVisualLen: number): string {
    const dv = this.dockerVersion ? ` ${t.dim('· docker')} ${t.dim(this.dockerVersion)}` : '';
    const prefix = ` ${t.accent('◆')} ${t.accent('docktui')} ${t.dim(`v${VERSION}`)}${dv}  `;
    const prefixLen = visualLength(prefix);
    const sockBudget = Math.max(8, width - prefixLen - rightVisualLen - 4);
    const sock = this.socketPath ? t.dim(truncateMiddle(this.socketPath, sockBudget)) : '';
    return prefix + sock;
  }

  private buildRight(width: number): string {
    const counters =
      `${t.green('●')}${t.fg(String(this.counters.running))} ${t.dim('running')}` +
      `  ${t.red('●')}${t.fg(String(this.counters.errored))} ${t.dim('err')}` +
      `  ${t.fg(String(this.counters.stopped))} ${t.dim('stop')}`;

    const stats = this.stats
      ? `${t.dim('cpu')} ${t.dim(`${this.stats.cpuPercent.toFixed(1)}%`)}` +
        `  ${t.dim('mem')} ${t.dim(humanSizeMB(this.stats.memUsageMB))}`
      : '';

    const pieces: string[] = [];
    if (width >= 120 && stats) pieces.push(stats);
    if (width >= 95) pieces.push(counters);

    return `${pieces.join(SEP)} `;
  }
}

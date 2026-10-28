import blessed from 'neo-blessed';
import type { ContainerInfo, ContainerStats } from '@models/docker';
import { t } from '@theme';
import { padEnd, truncate } from '@utils/format';
import { formatCpuCell, formatMemCell, isActive, statusDot, type MemDisplay } from '@utils/status';
import type { Stack } from '@utils/stacks';
import {
  createCenteredMessage,
  createHeaderBar,
  createListWidget,
  listSelected,
  type Dims,
} from '@ui/widgets';

export interface ColumnSpec {
  totalWidth: number;
  indentW: number;
  nameW: number;
  imageW: number;
  statusW: number;
  cpuW: number;
  memW: number;
  portsW: number;
  showCpu: boolean;
  showMem: boolean;
  showPorts: boolean;
}

export function computeColumns(width: number, memDisplay: MemDisplay = 'percent'): ColumnSpec {
  const indentW = 3;
  const statusW = 16;
  const cpuW = 8;
  const memW = memDisplay === 'absolute' ? 11 : 8;
  const portsW = 22;

  const showPorts = width >= 90;
  const showMem = width >= 70;
  const showCpu = width >= 55;

  const fixedAfterIndent = statusW + (showCpu ? cpuW : 0) + (showMem ? memW : 0) + (showPorts ? portsW : 0);
  const flex = Math.max(18, width - indentW - fixedAfterIndent);
  const nameW = Math.max(10, Math.floor(flex * 0.55));
  const imageW = Math.max(8, flex - nameW);

  return {
    totalWidth: width,
    indentW,
    nameW,
    imageW,
    statusW,
    cpuW,
    memW,
    portsW: showPorts ? portsW : 0,
    showCpu,
    showMem,
    showPorts,
  };
}

interface StackHeaderRow {
  kind: 'stack-header';
  stackId: string;
  stack: Stack;
  expanded: boolean;
}

interface ServiceRow {
  kind: 'service';
  stackId: string;
  container: ContainerInfo;
}

type Row = StackHeaderRow | ServiceRow;

export type StackTreeSelection =
  | { kind: 'stack'; stack: Stack; expanded: boolean }
  | { kind: 'service'; container: ContainerInfo; stackId: string }
  | null;

type NavigateHandler = (sel: StackTreeSelection) => void;

export class StackTree {
  private wrapper: blessed.Widgets.BoxElement;
  private header: blessed.Widgets.BoxElement;
  readonly list: blessed.Widgets.ListElement;
  private messageBox: blessed.Widgets.BoxElement;

  private stacks: Stack[] = [];
  private statsCache = new Map<string, ContainerStats>();
  private memDisplay: MemDisplay = 'percent';
  private rows: Row[] = [];

  private expanded = new Set<string>();
  private seenStacks = new Set<string>();
  private filter = '';
  private updating = false;

  private navigateHandlers: NavigateHandler[] = [];

  constructor(parent: blessed.Widgets.Screen | blessed.Widgets.BoxElement, dims: Dims) {
    this.wrapper = blessed.box({
      parent,
      top: dims.top,
      left: dims.left,
      width: dims.width,
      height: dims.height,
    });

    this.header = createHeaderBar(this.wrapper);
    this.list = createListWidget(this.wrapper);
    this.messageBox = createCenteredMessage(this.wrapper);

    this.list.on('select item', (_item: unknown, index: number) => {
      if (this.updating) return;
      this.emitNavigate(index);
    });
  }

  on(event: 'navigate', handler: NavigateHandler): void {
    if (event === 'navigate') this.navigateHandlers.push(handler);
  }

  show(): void {
    this.wrapper.show();
  }

  hide(): void {
    this.wrapper.hide();
  }

  focus(): void {
    this.list.focus();
  }

  showLoading(): void {
    this.messageBox.setContent(t.dim('  Loading…'));
    this.messageBox.show();
  }

  setData(stacks: Stack[], statsCache: Map<string, ContainerStats>): void {
    // Auto-expand live stacks the first time we see them (e.g. on startup).
    for (const s of stacks) {
      if (!this.seenStacks.has(s.id)) {
        this.seenStacks.add(s.id);
        if (s.isLive) this.expanded.add(s.id);
      }
    }

    this.stacks = stacks;
    this.statsCache = statsCache;
    this.rebuild({ preserveSelection: true });
  }

  setFilter(q: string): void {
    this.filter = q;
    this.rebuild({ preserveSelection: false });
  }

  getFilter(): string {
    return this.filter;
  }

  toggleExpansion(): boolean {
    const sel = this.rows[listSelected(this.list)];
    if (!sel || sel.kind !== 'stack-header') return false;
    if (this.expanded.has(sel.stackId)) this.expanded.delete(sel.stackId);
    else this.expanded.add(sel.stackId);
    this.rebuild({ preserveSelection: true });
    return true;
  }

  expandSelected(): void {
    const sel = this.rows[listSelected(this.list)];
    if (!sel) return;
    if (sel.kind === 'stack-header' && !this.expanded.has(sel.stackId)) {
      this.expanded.add(sel.stackId);
      this.rebuild({ preserveSelection: true });
    }
  }

  collapseSelected(): void {
    const idx = listSelected(this.list);
    const sel = this.rows[idx];
    if (!sel) return;
    if (sel.kind === 'stack-header' && this.expanded.has(sel.stackId)) {
      this.expanded.delete(sel.stackId);
      this.rebuild({ preserveSelection: true });
      return;
    }
    if (sel.kind === 'service') {
      const headerIdx = this.rows.findIndex((r) => r.kind === 'stack-header' && r.stackId === sel.stackId);
      if (headerIdx >= 0) {
        this.updating = true;
        this.list.select(headerIdx);
        this.updating = false;
        this.emitNavigate(headerIdx);
      }
    }
  }

  jumpToStack(stackId: string): void {
    this.expanded.add(stackId);
    this.rebuild({ preserveSelection: false });
    const idx = this.rows.findIndex((r) => r.kind === 'stack-header' && r.stackId === stackId);
    if (idx >= 0) {
      this.updating = true;
      this.list.select(idx);
      this.updating = false;
      this.emitNavigate(idx);
    }
  }

  getSelected(): StackTreeSelection {
    const idx = listSelected(this.list);
    return this.rowToSelection(this.rows[idx]);
  }

  /** Re-render the current dataset (call after terminal resize). */
  setMemDisplay(display: MemDisplay): void {
    this.memDisplay = display;
    this.redraw();
  }

  redraw(): void {
    this.rebuild({ preserveSelection: true });
  }

  private rebuild({ preserveSelection }: { preserveSelection: boolean }): void {
    const prevKey = preserveSelection ? this.currentSelectionKey() : null;

    this.messageBox.hide();
    this.rows = this.flatten();

    const width = Math.max(20, Number(this.list.width) - 2);
    const cols = computeColumns(width, this.memDisplay);

    this.renderHeader(cols);

    const items = this.rows.map((r) => this.renderRow(r, cols));
    this.updating = true;
    this.list.setItems(items as unknown as blessed.Widgets.BlessedElement[]);

    let target = 0;
    if (prevKey) {
      const found = this.rows.findIndex((r) => this.rowKey(r) === prevKey);
      if (found >= 0) target = found;
    }
    target = Math.min(target, Math.max(0, this.rows.length - 1));
    this.list.select(target);
    this.updating = false;

    if (this.rows.length === 0) {
      const msg = this.filter ? `  No matches for ${t.fg(this.filter)}` : '  No stacks';
      this.messageBox.setContent(t.dim(msg));
      this.messageBox.show();
    }

    this.emitNavigate(target);
  }

  private flatten(): Row[] {
    const out: Row[] = [];
    const needle = this.filter.toLowerCase();

    for (const s of this.stacks) {
      let services = s.services;
      const stackMatches = !needle || s.id.toLowerCase().includes(needle);

      if (needle && !stackMatches) {
        services = s.services.filter(
          (c) => c.name.toLowerCase().includes(needle) || c.image.toLowerCase().includes(needle),
        );
        if (services.length === 0) continue;
      }

      const expanded = this.expanded.has(s.id) || (Boolean(needle) && !stackMatches);
      out.push({
        kind: 'stack-header',
        stackId: s.id,
        stack: s,
        expanded,
      });

      if (expanded) {
        for (const c of services) {
          out.push({ kind: 'service', stackId: s.id, container: c });
        }
      }
    }

    return out;
  }

  private renderHeader(cols: ColumnSpec): void {
    const indent = padEnd('', cols.indentW);
    const name = padEnd(t.dim('STACK · SERVICE'), cols.nameW + cols.imageW + 1);
    const status = padEnd(t.dim('STATE'), cols.statusW);
    const cpu = cols.showCpu ? padEnd(t.dim('CPU'), cols.cpuW) : '';
    const mem = cols.showMem ? padEnd(t.dim('MEM'), cols.memW) : '';
    const ports = cols.showPorts ? t.dim('PORTS') : '';
    this.header.setContent(`${indent}${name}${status}${cpu}${mem}${ports}`);
  }

  private renderRow(row: Row, cols: ColumnSpec): string {
    return row.kind === 'stack-header' ? this.renderStackHeader(row, cols) : this.renderService(row, cols);
  }

  private renderStackHeader(row: StackHeaderRow, cols: ColumnSpec): string {
    const caret = row.expanded ? t.accent('▾') : t.accent('▸');
    const indent = padEnd(` ${caret}`, cols.indentW);

    const glyph = t.accent('▣');
    const labelMax = cols.nameW + cols.imageW - 4;
    const name = truncate(row.stack.id, labelMax);
    const nameRender = row.stack.isLive ? `{bold}${t.fg(name)}{/bold}` : `{bold}${t.dim(name)}{/bold}`;

    const counts = row.stack.counts;
    const pills: string[] = [];
    if (counts.running > 0) pills.push(this.pill(`${counts.running} up`, t.green));
    if (counts.errored > 0) pills.push(this.pill(`${counts.errored} err`, t.red));
    if (counts.stopped > 0) pills.push(this.pill(`${counts.stopped} stop`, t.faint));

    const nameCol = padEnd(`${glyph} ${nameRender}  ${pills.join(' ')}`, cols.nameW + cols.imageW + 1);

    const stateLabel = row.stack.isLive ? t.aqua('live') : t.faint('—');
    const status = padEnd(stateLabel, cols.statusW);

    const cpu = cols.showCpu ? padEnd('', cols.cpuW) : '';
    const mem = cols.showMem ? padEnd('', cols.memW) : '';
    const ports = cols.showPorts ? '' : '';

    return `${indent}${nameCol}${status}${cpu}${mem}${ports}`;
  }

  private renderService(row: ServiceRow, cols: ColumnSpec): string {
    const c = row.container;
    const indent = padEnd(` ${t.faint('└─')}`, cols.indentW);

    const dot = statusDot(c);
    const nameMax = Math.max(4, cols.nameW - 3);
    const name = truncate(c.name, nameMax);
    const nameStyled = isActive(c.status) ? t.fg(name) : t.dim(name);
    const nameCol = padEnd(`${dot} ${nameStyled}`, cols.nameW);

    const imageMax = Math.max(4, cols.imageW - 1);
    const image = truncate(c.image, imageMax);
    const imageCol = padEnd(t.dim(image), cols.imageW + 1);

    const status = padEnd(this.colorStatus(c, shortStatus(c)), cols.statusW);

    const cpuVal = this.statsCache.get(c.id)?.cpuPercent;

    const cpuCol = cols.showCpu ? padEnd(formatCpuCell(c, cpuVal), cols.cpuW) : '';
    const memCol = cols.showMem
      ? padEnd(formatMemCell(c, this.statsCache.get(c.id), this.memDisplay), cols.memW)
      : '';

    let portsCol = '';
    if (cols.showPorts) {
      const portStr = c.ports[0] ? truncate(c.ports[0], cols.portsW - 1) : '';
      portsCol = portStr ? t.pink(portStr) : t.faint('—');
    }

    return `${indent}${nameCol}${imageCol}${status}${cpuCol}${memCol}${portsCol}`;
  }

  private pill(text: string, color: (s: string) => string): string {
    return `${t.faint('[')}${color(text)}${t.faint(']')}`;
  }

  private colorStatus(c: ContainerInfo, text: string): string {
    if (isActive(c.status)) return t.green(text);
    if ((c.status === 'exited' || c.status === 'dead') && c.exitCode !== 0) return t.red(text);
    return t.dim(text);
  }

  private currentSelectionKey(): string | null {
    return this.rowKey(this.rows[listSelected(this.list)]);
  }

  private rowKey(row: Row | undefined): string | null {
    if (!row) return null;
    return row.kind === 'stack-header' ? `s:${row.stackId}` : `c:${row.container.id}`;
  }

  private rowToSelection(row: Row | undefined): StackTreeSelection {
    if (!row) return null;
    if (row.kind === 'stack-header') {
      return { kind: 'stack', stack: row.stack, expanded: row.expanded };
    }
    return { kind: 'service', container: row.container, stackId: row.stackId };
  }

  private emitNavigate(idx: number): void {
    const sel = this.rowToSelection(this.rows[idx]);
    this.navigateHandlers.forEach((h) => h(sel));
  }
}

function shortRelative(s: string): string {
  if (/^a few seconds ago$/.test(s)) return 'now';
  const m = s.match(/^(an?|\d+)\s+(second|minute|hour|day|month|year)s?\s+ago$/);
  if (!m) return s;
  const num = m[1] === 'a' || m[1] === 'an' ? '1' : m[1];
  const unit = m[2];
  const suffix =
    unit === 'second'
      ? 's'
      : unit === 'minute'
        ? 'm'
        : unit === 'hour'
          ? 'h'
          : unit === 'day'
            ? 'd'
            : unit === 'month'
              ? 'mo'
              : 'y';
  return `${num}${suffix}`;
}

function shortStatus(c: ContainerInfo): string {
  switch (c.status) {
    case 'running':
      return `RUN ${c.uptime}`;
    case 'paused':
      return 'PAUSED';
    case 'restarting':
      return 'RESTARTING';
    case 'exited':
      return c.exitCode === 0 ? `EXIT 0 · ${shortRelative(c.uptime)}` : `EXIT ${c.exitCode}`;
    case 'dead':
      return c.exitCode !== 0 ? `DEAD ${c.exitCode}` : 'DEAD';
    case 'created':
      return 'NEW';
    case 'removing':
      return 'RMV';
  }
}

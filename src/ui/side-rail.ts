import blessed from 'neo-blessed';
import { C, t } from '@theme';
import type { Stack } from '@utils/stacks';
import { padEnd, truncate, visualLength } from '@utils/format';

export type ViewId = 'stacks' | 'containers' | 'images' | 'volumes' | 'networks';

export interface ViewCounts {
  stacks: number;
  containers: number;
  images: number;
  volumes: number;
  networks: number;
}

interface ViewSpec {
  id: ViewId;
  label: string;
  icon: string;
  key: string;
}

const VIEWS: ViewSpec[] = [
  { id: 'stacks', label: 'Stacks', icon: '◰', key: '1' },
  { id: 'containers', label: 'Containers', icon: '◧', key: '2' },
  { id: 'images', label: 'Images', icon: '◩', key: '3' },
  { id: 'volumes', label: 'Volumes', icon: '◪', key: '4' },
  { id: 'networks', label: 'Networks', icon: '◫', key: '5' },
];

export const RAIL_WIDTH = 28;

type ViewChangeHandler = (id: ViewId) => void;
type StackJumpHandler = (stackId: string) => void;

interface ClickableLine {
  row: number;
  kind: 'view' | 'stack';
  payload: ViewId | string;
}

export class SideRail {
  readonly box: blessed.Widgets.BoxElement;

  private activeView: ViewId = 'stacks';
  private counts: ViewCounts = { stacks: 0, containers: 0, images: 0, volumes: 0, networks: 0 };
  private stacks: Stack[] = [];
  private clickable: ClickableLine[] = [];

  private viewChangeHandlers: ViewChangeHandler[] = [];
  private stackJumpHandlers: StackJumpHandler[] = [];

  constructor(screen: blessed.Widgets.Screen) {
    this.box = blessed.box({
      parent: screen,
      top: 1,
      left: 0,
      width: RAIL_WIDTH,
      height: '100%-2',
      tags: true,
      mouse: true,
      style: { bg: C.bg, fg: C.fg },
    });

    this.box.on('click', (data: { y: number }) => {
      const top = Number(this.box.atop ?? 1);
      const relRow = data.y - top;
      const hit = this.clickable.find((c) => c.row === relRow);
      if (!hit) return;
      if (hit.kind === 'view') this.viewChangeHandlers.forEach((h) => h(hit.payload as ViewId));
      else if (hit.kind === 'stack') this.stackJumpHandlers.forEach((h) => h(hit.payload as string));
    });
  }

  on(event: 'view-change', handler: ViewChangeHandler): void;
  on(event: 'stack-jump', handler: StackJumpHandler): void;
  on(event: 'view-change' | 'stack-jump', handler: ViewChangeHandler | StackJumpHandler): void {
    if (event === 'view-change') this.viewChangeHandlers.push(handler as ViewChangeHandler);
    else if (event === 'stack-jump') this.stackJumpHandlers.push(handler as StackJumpHandler);
  }

  setActiveView(id: ViewId): void {
    this.activeView = id;
    this.render();
  }

  setCounts(counts: ViewCounts): void {
    this.counts = counts;
    this.render();
  }

  setStacks(stacks: Stack[]): void {
    this.stacks = stacks;
    this.render();
  }

  getViews(): ViewSpec[] {
    return VIEWS;
  }

  private render(): void {
    const lines: string[] = [];
    this.clickable = [];

    lines.push(t.dim(' VIEW'));
    for (const v of VIEWS) {
      const idx = lines.length;
      lines.push(this.renderViewRow(v));
      this.clickable.push({ row: idx, kind: 'view', payload: v.id });
    }

    lines.push('');
    lines.push(t.dim(' STACKS'));
    const stackLines = this.renderStacks();
    for (const sl of stackLines) {
      const idx = lines.length;
      lines.push(sl.text);
      if (sl.stackId) this.clickable.push({ row: idx, kind: 'stack', payload: sl.stackId });
    }

    this.box.setContent(lines.join('\n'));
  }

  private renderViewRow(v: ViewSpec): string {
    const count = String(this.counts[v.id]);
    const isActive = this.activeView === v.id;
    const labelWidth = RAIL_WIDTH - 7; // 2 indent + icon + space + count budget(3) + trailing
    const labelRaw = truncate(v.label, labelWidth);
    if (isActive) {
      const edge = `{${C.accent}-fg}▌{/}`;
      const inner = ` ${t.accent(v.icon)} ${t.fg(labelRaw)}`;
      const right = t.dim(count);
      const padded = padEnd(`${edge}${inner}`, RAIL_WIDTH - visualLength(right) - 1);
      return `${padded}${right} `;
    }
    const inner = `  ${t.dim(v.icon)} ${t.dim(labelRaw)}`;
    const right = t.faint(count);
    const padded = padEnd(inner, RAIL_WIDTH - visualLength(right) - 1);
    return `${padded}${right} `;
  }

  private renderStacks(): Array<{ text: string; stackId?: string }> {
    if (this.stacks.length === 0) {
      return [{ text: `  ${t.faint('(none)')}` }];
    }
    // Cap the visible stacks list; if there's overflow, show a "+N more" tail.
    const MAX = 10;
    const lines: Array<{ text: string; stackId?: string }> = [];
    const shown = this.stacks.slice(0, MAX);
    for (const s of shown) {
      const dot = s.isLive ? t.green('●') : t.faint('○');
      const labelMax = RAIL_WIDTH - 8;
      const name = truncate(s.id, labelMax);
      const nameStyled = s.isLive ? t.fg(name) : t.dim(name);
      const count = t.faint(String(s.services.length));
      const left = `  ${dot} ${nameStyled}`;
      const padded = padEnd(left, RAIL_WIDTH - visualLength(count) - 1);
      lines.push({ text: `${padded}${count} `, stackId: s.id });
    }
    const overflow = this.stacks.length - shown.length;
    if (overflow > 0) {
      lines.push({ text: t.faint(`  +${overflow} more…`) });
    }
    return lines;
  }
}

import blessed from 'neo-blessed';
import { C } from '@theme';
type Parent = blessed.Widgets.Screen | blessed.Widgets.BoxElement;

export interface Dims {
  top: number | string;
  left: number | string;
  width: number | string;
  height: number | string;
}

interface ListOptions {
  top?: number | string;
  left?: number | string;
  width?: number | string;
  height?: number | string;
}

export function listSelected(list: blessed.Widgets.ListElement): number {
  // biome-ignore lint/suspicious/noExplicitAny: untyped payload at the dockerode/blessed edge
  const raw = (list as any).selected;
  return typeof raw === 'number' ? raw : 0;
}

export function createListWidget(parent: Parent, opts: ListOptions = {}): blessed.Widgets.ListElement {
  return blessed.list({
    parent,
    top: opts.top ?? 1,
    left: opts.left ?? 0,
    width: opts.width ?? '100%',
    height: opts.height ?? '100%-1',
    keys: true,
    mouse: true,
    vi: true,
    scrollable: true,
    scrollbar: { ch: '│', style: { fg: C.comment } },
    border: { type: 'line' },
    style: {
      selected: { bg: C.selection, fg: C.fg },
      item: { fg: C.fg },
      border: { fg: C.selection },
      focus: { border: { fg: C.purple } },
    },
    tags: true,
  });
}

export function createHeaderBar(parent: Parent, hidden = false): blessed.Widgets.BoxElement {
  return blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { bg: C.selection },
    hidden,
  });
}

export function createCenteredMessage(parent: Parent): blessed.Widgets.BoxElement {
  return blessed.box({
    parent,
    top: 'center',
    left: 'center',
    width: '60%',
    height: 1,
    tags: true,
    hidden: true,
  });
}

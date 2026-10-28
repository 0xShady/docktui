import blessed from 'neo-blessed';
import { C, t } from '@theme';

type HideHandler = () => void;

export class HelpOverlay {
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  private visible = false;
  private hideHandlers: HideHandler[] = [];

  private readonly handleClose = () => {
    if (!this.visible) return;
    this.hide();
  };

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;

    this.box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: '85%',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      border: { type: 'line' },
      style: {
        bg: C.bgSoft,
        border: { fg: C.accent },
      },
      hidden: true,
    });

    screen.append(this.box);
  }

  on(event: 'hide', handler: HideHandler): void {
    if (event === 'hide') this.hideHandlers.push(handler);
  }

  show(): void {
    this.visible = true;
    this.box.setContent(this.buildContent());
    this.box.show();
    this.box.setFront();
    this.box.focus();
    this.screen.key(['escape'], this.handleClose);
    this.screen.render();
  }

  hide(): void {
    this.visible = false;
    this.box.hide();
    this.screen.removeKey('escape', this.handleClose);
    this.hideHandlers.forEach((h) => h());
    this.screen.render();
  }

  isVisible(): boolean {
    return this.visible;
  }

  private buildContent(): string {
    const KW = 18;
    const row = (key: string, desc: string): string => `  ${t.aqua(key.padEnd(KW))}${t.fg(desc)}`;
    const section = (name: string): string => `\n  ${t.accent(name)}\n`;

    return [
      `  {bold}${t.accent('docktui — key bindings')}{/bold}`,
      section('Navigation'),
      row('1 … 5', 'Jump to Stacks / Containers / Images / Volumes / Networks'),
      row('Tab / Shift+Tab', 'Cycle views'),
      row('h', 'Toggle this help'),
      row('q / Ctrl+C', 'Quit'),
      section('Stacks view'),
      row('↑ ↓ / j k', 'Navigate the tree'),
      row('→', 'Expand the selected stack'),
      row('←', 'Collapse the selected stack (or jump to its header)'),
      row('Enter', 'On a stack: toggle expansion. On a service: open detail.'),
      row('l', 'Open log viewer for the selected service'),
      row('x', "Open an external terminal exec'd into the service"),
      row('s / r / k', 'Stop / restart / kill the running service (confirm dialog)'),
      row('S', 'Start a stopped service'),
      row('d', 'Remove a stopped service (confirm dialog)'),
      row('/', 'Filter stacks and services (Esc cancels)'),
      section('Containers view'),
      row('↑ ↓ / j k', 'Navigate list'),
      row('Enter', 'Open detail panel'),
      row('l', 'Open log viewer'),
      row('x', 'Shell into container'),
      row('s / r / k', 'Stop / restart / kill running container'),
      row('S', 'Start stopped container'),
      row('d', 'Remove stopped container'),
      section('Detail panel'),
      row('e', 'Toggle environment variables'),
      row('l', 'Open log viewer'),
      row('s / r / k', 'Stop / restart / kill running container (confirm)'),
      row('S', 'Start stopped container'),
      row('d', 'Remove stopped container (confirm)'),
      row('x', 'Shell into running container'),
      row('↑ ↓', 'Scroll detail content'),
      row('Esc', 'Close detail panel'),
      section('Log viewer'),
      row('f', 'Toggle follow mode'),
      row('g', 'Scroll to top'),
      row('G', 'Scroll to bottom (re-enables follow)'),
      row('↑ / k', 'Scroll up (disables follow)'),
      row('Esc', 'Close log viewer'),
      section('Help overlay'),
      row('h', 'Toggle this help (open or close)'),
      row('Esc', 'Close this help'),
      section('Images, Volumes & Networks'),
      row('↑ ↓ / j k', 'Navigate list'),
      row('d', 'Delete unused item'),
      section('Confirm dialog'),
      row('y / Y', 'Confirm action'),
      row('n / N / Esc', 'Cancel'),
    ].join('\n');
  }
}

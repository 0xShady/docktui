import blessed from 'neo-blessed';
import { C, t } from '@theme';
import { wrapText } from '@utils/format';

const WIDTH = 52;
const TEXT_WIDTH = WIDTH - 6;

interface ShowOptions {
  title: string;
  message: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export class ConfirmDialog {
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;

  private visible = false;
  private onConfirm: (() => void) | null = null;
  private onCancel: (() => void) | null = null;

  private readonly handleConfirm = () => {
    if (!this.visible) return;
    this.hide();
    this.onConfirm?.();
  };

  private readonly handleCancel = () => {
    if (!this.visible) return;
    this.hide();
    this.onCancel?.();
  };

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;

    this.box = blessed.box({
      parent: screen,
      width: WIDTH,
      height: 9,
      top: 'center',
      left: 'center',
      tags: true,
      border: { type: 'line' },
      style: {
        bg: C.selection,
        border: { fg: C.purple },
      },
      hidden: true,
    });

    screen.append(this.box);
  }

  show(options: ShowOptions): void {
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel;

    const danger = options.danger ?? false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.box as any).style.border.fg = danger ? C.red : C.purple;

    const confirmBtn = danger
      ? `${t.red('[y]')} ${t.fg('Yes, proceed')}`
      : `${t.green('[y]')} ${t.fg('Yes')}`;

    const lines = [
      '',
      `  {bold}${danger ? t.red(options.title) : t.fg(options.title)}{/bold}`,
      '',
      ...wrapText(options.message, TEXT_WIDTH).map((line) => `  ${t.comment(line)}`),
      '',
      `  ${confirmBtn}    ${t.comment('[n] Cancel')}`,
      `  ${t.comment('y:confirm  n / Esc:cancel')}`,
    ];

    this.box.height = Math.min(lines.length + 2, Number(this.screen.height));
    this.box.setContent(lines.join('\n'));
    this.visible = true;
    this.box.show();
    this.box.focus();

    this.screen.key(['y', 'S-y'], this.handleConfirm);
    this.screen.key(['n', 'S-n', 'escape'], this.handleCancel);

    this.screen.render();
  }

  hide(): void {
    this.visible = false;
    this.box.hide();

    for (const k of ['y', 'S-y']) this.screen.removeKey(k, this.handleConfirm);
    for (const k of ['n', 'S-n', 'escape']) this.screen.removeKey(k, this.handleCancel);

    this.screen.render();
  }

  isVisible(): boolean {
    return this.visible;
  }
}

import blessed from 'neo-blessed';
import { ConfirmDialog } from '@ui/containers/confirm-dialog';
import { t } from '@theme';
import { padEnd, truncate } from '@utils/format';
import {
  createCenteredMessage,
  createHeaderBar,
  createListWidget,
  listSelected,
  type Dims,
} from '@ui/widgets';

type ErrorHandler = (message: string) => void;
type NavigateHandler<T> = (item: T | null) => void;

export interface ResourceColumn<T> {
  /** Header label; truncated to the column width so it can never overflow. */
  header: string;
  /** Fraction of the inner width; the final column absorbs the remainder. */
  weight: number;
  /** Colored cell content, already truncated to fit `width` (the base pads it). */
  render: (item: T, width: number) => string;
}

export interface ResourceListConfig<T> {
  list: () => Promise<T[]>;
  remove: (item: T) => Promise<void>;
  /** Stable key used to preserve the selection across refreshes. */
  getKey: (item: T) => string;
  /** Shown centered when the list is empty (e.g. `No networks`). */
  emptyMessage: string;
  confirmTitle: string;
  confirmLabel: (item: T) => string;
  /** Ordered guards; the first non-null message blocks deletion and is emitted. */
  guards: Array<(item: T) => string | null>;
  columns: ResourceColumn<T>[];
}

/**
 * Shared machinery for the flat "resource list" tabs (Images / Volumes / Networks):
 * a header bar over a bordered list, `d`-to-delete with a confirm dialog and guards,
 * selection preservation across polls, and navigate/error events. Concrete tabs supply
 * only their columns, guards, confirm strings, and list/remove functions via config.
 */
export class ResourceListTab<T> {
  private screen: blessed.Widgets.Screen;
  private wrapper: blessed.Widgets.BoxElement;
  private headerBox: blessed.Widgets.BoxElement;
  readonly list: blessed.Widgets.ListElement;
  private messageBox: blessed.Widgets.BoxElement;
  private confirmDialog: ConfirmDialog;

  private items: T[] = [];
  private active = false;
  private updating = false;
  /** Last listing failure; shown in the panel until the next successful poll. */
  private loadError: string | null = null;
  private errorHandlers: ErrorHandler[] = [];
  private navigateHandlers: NavigateHandler<T>[] = [];

  private readonly handleD = () => {
    if (!this.active || this.confirmDialog.isVisible()) return;
    const item = this.items[listSelected(this.list)];
    if (!item) return;

    for (const guard of this.config.guards) {
      const msg = guard(item);
      if (msg) {
        this.emitError(msg);
        return;
      }
    }

    this.confirmDialog.show({
      title: this.config.confirmTitle,
      message: `${this.config.confirmLabel(item)} will be permanently deleted.`,
      danger: true,
      onConfirm: () => {
        void this.config
          .remove(item)
          .then(() => this.refresh())
          .catch((err: unknown) => this.emitError(err))
          .finally(() => {
            this.list.focus();
            this.screen.render();
          });
      },
      onCancel: () => {
        this.list.focus();
        this.screen.render();
      },
    });
  };

  constructor(
    screen: blessed.Widgets.Screen,
    dims: Dims,
    private readonly config: ResourceListConfig<T>,
  ) {
    this.screen = screen;

    this.wrapper = blessed.box({
      parent: screen,
      top: dims.top,
      left: dims.left,
      width: dims.width,
      height: dims.height,
      hidden: true,
    });

    this.headerBox = createHeaderBar(this.wrapper);
    this.list = createListWidget(this.wrapper);
    this.messageBox = createCenteredMessage(this.wrapper);

    this.list.on('select item', (_item: unknown, index: number) => {
      if (!this.updating) {
        this.navigateHandlers.forEach((h) => h(this.items[index] ?? null));
      }
    });

    this.confirmDialog = new ConfirmDialog(screen);
  }

  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'navigate', handler: NavigateHandler<T>): void;
  on(event: 'error' | 'navigate', handler: ErrorHandler | NavigateHandler<T>): void {
    if (event === 'error') this.errorHandlers.push(handler as ErrorHandler);
    if (event === 'navigate') this.navigateHandlers.push(handler as NavigateHandler<T>);
  }

  isConfirmOpen(): boolean {
    return this.confirmDialog.isVisible();
  }

  showLoading(): void {
    this.messageBox.setContent(t.comment('  Loading...'));
    this.messageBox.show();
  }

  show(): void {
    this.active = true;
    this.wrapper.show();
    this.list.focus();
    this.screen.key(['d'], this.handleD);
    this.emitNavigate();
  }

  hide(): void {
    this.active = false;
    this.wrapper.hide();
    if (this.confirmDialog.isVisible()) this.confirmDialog.hide();
    this.screen.removeKey('d', this.handleD);
  }

  setData(items: T[]): void {
    this.loadError = null;
    this.applyData(items);
  }

  /**
   * Show a listing failure in the panel itself rather than the footer — polls repeat,
   * so a footer message would re-fire every cycle. Clears the rows so a stale item
   * can't be deleted; the next successful `setData` replaces the message.
   */
  showLoadError(message: string): void {
    this.loadError = message;
    this.applyData([]);
  }

  private applyData(items: T[]): void {
    this.updating = true;

    const prevIdx = listSelected(this.list);
    const prev = this.items[prevIdx];
    const prevKey = prev ? this.config.getKey(prev) : undefined;

    this.items = items;
    this.messageBox.hide();
    this.messageBox.height = 1;

    const innerWidth = Math.max(10, (this.list.width as number) - 2);
    const widths = this.calcWidths(innerWidth);

    this.renderHeader(widths);

    const rows = items.map((item) => this.buildRow(item, widths));
    this.list.setItems(rows as unknown as blessed.Widgets.BlessedElement[]);

    const foundIdx = prevKey !== undefined ? items.findIndex((it) => this.config.getKey(it) === prevKey) : -1;
    const targetIdx = Math.min(foundIdx >= 0 ? foundIdx : prevIdx, Math.max(0, items.length - 1));
    this.list.select(targetIdx);

    this.updating = false;

    if (this.loadError) {
      // Taller box so a long daemon error wraps instead of being clipped.
      this.messageBox.height = 3;
      this.messageBox.setContent(t.red(`  ${this.loadError}`));
      this.messageBox.show();
    } else if (items.length === 0) {
      this.messageBox.setContent(t.comment(`  ${this.config.emptyMessage}`));
      this.messageBox.show();
    }

    this.emitNavigate();
  }

  async refresh(): Promise<void> {
    const items = await this.config.list();
    this.setData(items);
  }

  /** Re-render the current dataset (useful after terminal resize). */
  redraw(): void {
    this.applyData(this.items);
  }

  private emitNavigate(): void {
    this.navigateHandlers.forEach((h) => h(this.items[listSelected(this.list)] ?? null));
  }

  private emitError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.errorHandlers.forEach((h) => h(msg));
  }

  private calcWidths(inner: number): number[] {
    const cols = this.config.columns;
    const widths: number[] = [];
    let used = 0;
    for (let i = 0; i < cols.length; i++) {
      if (i === cols.length - 1) {
        widths.push(Math.max(1, inner - used));
      } else {
        const w = Math.floor(inner * cols[i].weight);
        widths.push(w);
        used += w;
      }
    }
    return widths;
  }

  private renderHeader(widths: number[]): void {
    const cols = this.config.columns;
    const parts = cols.map((col, i) => {
      const w = widths[i];
      // First column carries a leading space and pads to w+1 (the list body indents
      // its rows by one), matching the data offset below.
      if (i === 0) return padEnd(t.comment(` ${truncate(col.header, w - 1)}`), w + 1);
      if (i === cols.length - 1) return t.comment(truncate(col.header, w));
      return padEnd(t.comment(truncate(col.header, w)), w);
    });
    this.headerBox.setContent(parts.join(''));
  }

  private buildRow(item: T, widths: number[]): string {
    return this.config.columns.map((col, i) => padEnd(col.render(item, widths[i]), widths[i])).join('');
  }
}

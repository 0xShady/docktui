export interface WeightedColumn {
  /** Fraction of the total width; ignored for the last column, which takes the rest. */
  weight: number;
  /** Width that fits the column's usual content plus a one-cell gap. */
  min: number;
  /** Smallest useful width, kept as long as possible on narrow terminals. */
  floor: number;
}

function sum(widths: number[]): number {
  return widths.reduce((total, w) => total + w, 0);
}

/** Narrows the column with the most spare room over its floor, one cell at a time. */
function shrink(widths: number[], floors: number[], cells: number): void {
  for (let left = cells; left > 0; left--) {
    let target = 0;
    for (let i = 1; i < widths.length; i++) {
      if (widths[i] - floors[i] > widths[target] - floors[target]) target = i;
    }
    if (widths[target] <= floors[target]) return;
    widths[target]--;
  }
}

export function columnWidths(total: number, columns: WeightedColumn[]): number[] {
  const mins = columns.map((c) => c.min);

  if (sum(mins) >= total) {
    const widths = [...mins];
    for (const floors of [columns.map((c) => c.floor), columns.map(() => 1)]) {
      shrink(widths, floors, sum(widths) - total);
    }
    return widths;
  }

  const last = columns.length - 1;
  const widths = columns.map((c, i) => (i === last ? c.min : Math.max(c.min, Math.floor(total * c.weight))));
  shrink(widths, mins, sum(widths) - total);
  widths[last] += total - sum(widths);
  return widths;
}

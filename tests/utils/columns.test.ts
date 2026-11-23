import { describe, expect, it } from 'vitest';
import { columnWidths } from '@utils/columns';

const COLUMNS = [
  { weight: 0.25, min: 14, floor: 10 },
  { weight: 0.12, min: 8, floor: 5 },
  { weight: 0.1, min: 13, floor: 8 },
  { weight: 0.15, min: 18, floor: 9 },
  { weight: 0.1, min: 9, floor: 8 },
  { weight: 0, min: 8, floor: 8 },
];

const sum = (widths: number[]) => widths.reduce((total, w) => total + w, 0);

describe('columnWidths', () => {
  it('uses the weights when there is room and gives the rest to the last column', () => {
    expect(columnWidths(200, COLUMNS)).toEqual([50, 24, 20, 30, 20, 56]);
  });

  it('raises a column to its minimum when its weight is too small', () => {
    expect(columnWidths(111, COLUMNS)).toEqual([27, 13, 13, 18, 11, 29]);
  });

  it('takes from the column with the most spare room when the last one would be too narrow', () => {
    expect(columnWidths(71, COLUMNS)).toEqual([15, 8, 13, 18, 9, 8]);
  });

  it('keeps the floors while it shrinks columns that do not fit', () => {
    const widths = columnWidths(51, COLUMNS);
    expect(sum(widths)).toBe(51);
    widths.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(COLUMNS[i].floor));
  });

  it('goes below the floors only when even those do not fit', () => {
    const widths = columnWidths(30, COLUMNS);
    expect(sum(widths)).toBe(30);
    expect(widths.every((w) => w >= 1)).toBe(true);
  });

  it('always fills exactly the available width from the minimums up', () => {
    for (let total = 20; total <= 240; total++) {
      const widths = columnWidths(total, COLUMNS);
      expect(sum(widths)).toBe(total);
      if (total >= 70) widths.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(COLUMNS[i].min));
    }
  });

  it('never goes below one cell', () => {
    expect(columnWidths(4, COLUMNS).every((w) => w >= 1)).toBe(true);
  });
});

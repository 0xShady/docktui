import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { C, PALETTE_KEYS, PRESETS, PRESET_NAMES, applyTheme, t } from '@theme';

const HEX = /^#[0-9a-f]{6}$/i;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

describe('theme presets', () => {
  afterEach(() => applyTheme(PRESETS.default));

  it('keeps the original palette as the default preset', () => {
    expect(PRESET_NAMES[0]).toBe('default');
    expect(PRESETS.default.bg).toBe('#0a0908');
    expect(PRESETS.default.accent).toBe('#a5a0ff');
  });

  it.each(PRESET_NAMES)('%s defines every palette key with a hex color', (name) => {
    const palette = PRESETS[name];
    expect(Object.keys(palette).sort()).toEqual([...PALETTE_KEYS].sort());
    for (const key of PALETTE_KEYS) expect(palette[key]).toMatch(HEX);
  });

  it('applyTheme updates the palette and its aliases in place', () => {
    applyTheme(PRESETS.nord);
    expect(C.bg).toBe(PRESETS.nord.bg);
    expect(C.bgAlt).toBe(PRESETS.nord.bgSoft);
    expect(C.selection).toBe(PRESETS.nord.bgSel);
    expect(C.comment).toBe(PRESETS.nord.dim);
    expect(C.cyan).toBe(PRESETS.nord.aqua);
    expect(t.accent('x')).toBe(`{${PRESETS.nord.accent}-fg}x{/}`);
  });

  it('no hex color is written outside theme.ts', () => {
    const src = resolve(__dirname, '..', 'src');
    const offenders = sourceFiles(src)
      .filter((file) => !file.endsWith('theme.ts'))
      .filter((file) => /#[0-9a-f]{6}\b/i.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

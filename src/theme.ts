export const PALETTE_KEYS = [
  'bg',
  'bgSoft',
  'panel',
  'bgSel',
  'bgSelEdge',
  'fg',
  'dim',
  'faint',
  'rule',
  'rule2',
  'accent',
  'purple',
  'green',
  'aqua',
  'yellow',
  'orange',
  'red',
  'pink',
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, string>;

export const PRESETS = {
  default: {
    bg: '#0a0908',
    bgSoft: '#0f0d0c',
    panel: '#13110f',
    bgSel: '#1a1840',
    bgSelEdge: '#6366f1',
    fg: '#e8e4d8',
    dim: '#8a8782',
    faint: '#5a5853',
    rule: '#231f1c',
    rule2: '#2e2925',
    accent: '#a5a0ff',
    purple: '#6366f1',
    green: '#5ed68a',
    aqua: '#5eead4',
    yellow: '#f4c64a',
    orange: '#fb923c',
    red: '#f87171',
    pink: '#f472b6',
  },
  nord: {
    bg: '#2e3440',
    bgSoft: '#3b4252',
    panel: '#3b4252',
    bgSel: '#434c5e',
    bgSelEdge: '#88c0d0',
    fg: '#eceff4',
    dim: '#a3abba',
    faint: '#616e88',
    rule: '#3b4252',
    rule2: '#4c566a',
    accent: '#88c0d0',
    purple: '#81a1c1',
    green: '#a3be8c',
    aqua: '#8fbcbb',
    yellow: '#ebcb8b',
    orange: '#d08770',
    red: '#bf616a',
    pink: '#b48ead',
  },
  gruvbox: {
    bg: '#282828',
    bgSoft: '#32302f',
    panel: '#3c3836',
    bgSel: '#504945',
    bgSelEdge: '#83a598',
    fg: '#ebdbb2',
    dim: '#a89984',
    faint: '#7c6f64',
    rule: '#3c3836',
    rule2: '#504945',
    accent: '#83a598',
    purple: '#d3869b',
    green: '#b8bb26',
    aqua: '#8ec07c',
    yellow: '#fabd2f',
    orange: '#fe8019',
    red: '#fb4934',
    pink: '#d3869b',
  },
  dracula: {
    bg: '#282a36',
    bgSoft: '#21222c',
    panel: '#343746',
    bgSel: '#44475a',
    bgSelEdge: '#bd93f9',
    fg: '#f8f8f2',
    dim: '#a4a8c0',
    faint: '#6272a4',
    rule: '#343746',
    rule2: '#44475a',
    accent: '#bd93f9',
    purple: '#bd93f9',
    green: '#50fa7b',
    aqua: '#8be9fd',
    yellow: '#f1fa8c',
    orange: '#ffb86c',
    red: '#ff5555',
    pink: '#ff79c6',
  },
} satisfies Record<string, Palette>;

export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

const withAliases = (p: Palette) => ({
  ...p,
  bgAlt: p.bgSoft,
  selection: p.bgSel,
  comment: p.dim,
  cyan: p.aqua,
});

export const C: ReturnType<typeof withAliases> = withAliases(PRESETS.default);

export function applyTheme(palette: Palette): void {
  Object.assign(C, withAliases(palette));
}

const tag = (hex: string, text: string): string => `{${hex}-fg}${text}{/}`;

export const t = {
  bg: (s: string) => tag(C.bg, s),
  bgSoft: (s: string) => tag(C.bgSoft, s),
  bgAlt: (s: string) => tag(C.bgAlt, s),
  panel: (s: string) => tag(C.panel, s),
  bgSel: (s: string) => tag(C.bgSel, s),
  selection: (s: string) => tag(C.selection, s),

  fg: (s: string) => tag(C.fg, s),
  dim: (s: string) => tag(C.dim, s),
  comment: (s: string) => tag(C.comment, s),
  faint: (s: string) => tag(C.faint, s),

  rule: (s: string) => tag(C.rule, s),
  rule2: (s: string) => tag(C.rule2, s),

  accent: (s: string) => tag(C.accent, s),
  purple: (s: string) => tag(C.purple, s),
  green: (s: string) => tag(C.green, s),
  aqua: (s: string) => tag(C.aqua, s),
  cyan: (s: string) => tag(C.cyan, s),
  yellow: (s: string) => tag(C.yellow, s),
  orange: (s: string) => tag(C.orange, s),
  red: (s: string) => tag(C.red, s),
  pink: (s: string) => tag(C.pink, s),
};

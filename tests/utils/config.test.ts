import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  DEFAULT_CONFIG,
  applyFlags,
  configPath,
  loadConfig,
  parseConfigFile,
  parseFlags,
  resolvePalette,
  tildify,
} from '@utils/config';
import { PRESETS } from '@theme';

const enoent = (): never => {
  throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
};

describe('parseFlags', () => {
  it('returns defaults when no flags are given', () => {
    expect(parseFlags([])).toEqual({
      config: undefined,
      theme: undefined,
      view: undefined,
      memory: undefined,
      help: false,
      version: false,
    });
  });

  it('reads long and short flags', () => {
    expect(
      parseFlags(['-c', 'my.toml', '--theme', 'nord', '--view', 'images', '--memory=absolute', '-h', '-v']),
    ).toEqual({
      config: 'my.toml',
      theme: 'nord',
      view: 'images',
      memory: 'absolute',
      help: true,
      version: true,
    });
  });

  it('rejects unknown flags with a pointer to --help', () => {
    expect(() => parseFlags(['--nope'])).toThrow(/--help/);
  });

  it('rejects positional arguments', () => {
    expect(() => parseFlags(['stacks'])).toThrow(/--help/);
  });
});

describe('configPath', () => {
  it('uses XDG_CONFIG_HOME when set', () => {
    expect(configPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/me')).toBe(join('/xdg', 'docktui', 'config.toml'));
  });

  it('falls back to ~/.config', () => {
    expect(configPath({}, '/home/me')).toBe(join('/home/me', '.config', 'docktui', 'config.toml'));
  });

  it('ignores an empty XDG_CONFIG_HOME', () => {
    expect(configPath({ XDG_CONFIG_HOME: '' }, '/home/me')).toBe(
      join('/home/me', '.config', 'docktui', 'config.toml'),
    );
  });
});

describe('tildify', () => {
  it('shortens paths under the home directory', () => {
    expect(tildify('/home/me/.config/docktui/config.toml', '/home/me')).toBe('~/.config/docktui/config.toml');
  });

  it('leaves other paths alone', () => {
    expect(tildify('/etc/docktui.toml', '/home/me')).toBe('/etc/docktui.toml');
    expect(tildify('/etc/docktui.toml', '')).toBe('/etc/docktui.toml');
  });
});

describe('parseConfigFile', () => {
  it('returns the defaults for an empty file', () => {
    expect(parseConfigFile('', 'c.toml')).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
  });

  it('reads every key', () => {
    const text =
      'theme = "gruvbox"\nview = "networks"\nmemory = "absolute"\n[refresh]\ncontainers = 3\nresources = 30\nstats = 1.5\n';
    expect(parseConfigFile(text, 'c.toml')).toEqual({
      config: {
        theme: 'gruvbox',
        view: 'networks',
        memory: 'absolute',
        refresh: { containers: 3, resources: 30, stats: 1.5 },
        colors: {},
      },
      warnings: [],
    });
  });

  it('keeps defaults for keys that are not set', () => {
    const { config } = parseConfigFile('[refresh]\nstats = 4\n', 'c.toml');
    expect(config).toEqual({ ...DEFAULT_CONFIG, refresh: { ...DEFAULT_CONFIG.refresh, stats: 4 } });
  });

  it('falls back to the defaults on invalid TOML', () => {
    const { config, warnings } = parseConfigFile('view = ', 'c.toml');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^c\.toml: .*Using the defaults\.$/);
  });

  it('warns about invalid values and keeps the default for them', () => {
    const text = 'view = "logs"\nmemory = 3\n[refresh]\ncontainers = 0\nstats = "fast"\nresources = 20\n';
    const { config, warnings } = parseConfigFile(text, 'c.toml');
    expect(config).toEqual({ ...DEFAULT_CONFIG, refresh: { ...DEFAULT_CONFIG.refresh, resources: 20 } });
    expect(warnings).toEqual([
      'c.toml: view must be one of stacks, containers, images, volumes, networks.',
      'c.toml: memory must be one of percent, absolute.',
      'c.toml: refresh.containers must be a number of seconds between 1 and 3600.',
      'c.toml: refresh.stats must be a number of seconds between 1 and 3600.',
    ]);
  });

  it('warns about an unknown theme', () => {
    const { config, warnings } = parseConfigFile('theme = "solarized"\n', 'c.toml');
    expect(config.theme).toBe('default');
    expect(warnings).toEqual(['c.toml: theme must be one of default, nord, gruvbox, dracula.']);
  });

  it('reads color overrides', () => {
    const { config, warnings } = parseConfigFile('[colors]\naccent = "#FF00AA"\nbg = "#000000"\n', 'c.toml');
    expect(config.colors).toEqual({ accent: '#FF00AA', bg: '#000000' });
    expect(warnings).toEqual([]);
  });

  it('warns about invalid colors and unknown color keys', () => {
    const text = '[colors]\naccent = "red"\ngreen = "#12345"\ncyan = "#00ffff"\nred = "#ff0000"\n';
    const { config, warnings } = parseConfigFile(text, 'c.toml');
    expect(config.colors).toEqual({ red: '#ff0000' });
    expect(warnings).toEqual([
      'c.toml: colors.accent must be a hex color like "#rrggbb".',
      'c.toml: colors.green must be a hex color like "#rrggbb".',
      'c.toml: unknown key colors.cyan.',
    ]);
  });

  it('warns when colors is not a table', () => {
    const { warnings } = parseConfigFile('colors = "nord"\n', 'c.toml');
    expect(warnings).toEqual(['c.toml: colors must be a table ([colors]).']);
  });

  it('warns about unknown keys', () => {
    const { warnings } = parseConfigFile('colour = "red"\n[refresh]\nlogs = 2\n', 'c.toml');
    expect(warnings).toEqual(['c.toml: unknown key colour.', 'c.toml: unknown key refresh.logs.']);
  });

  it('warns when refresh is not a table', () => {
    const { config, warnings } = parseConfigFile('refresh = 5\n', 'c.toml');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual(['c.toml: refresh must be a table ([refresh]).']);
  });

  it('does not share the default refresh object', () => {
    const { config } = parseConfigFile('', 'c.toml');
    config.refresh.stats = 9;
    expect(DEFAULT_CONFIG.refresh.stats).toBe(2);
  });
});

describe('loadConfig', () => {
  it('uses the defaults silently when the default file is missing', () => {
    expect(loadConfig({ path: 'c.toml', explicit: false, readFile: enoent })).toEqual({
      config: DEFAULT_CONFIG,
      warnings: [],
    });
  });

  it('fails when a file passed with --config is missing', () => {
    expect(() => loadConfig({ path: 'c.toml', explicit: true, readFile: enoent })).toThrow(
      /Cannot read config file c\.toml/,
    );
  });

  it('warns and uses the defaults when the default file cannot be read', () => {
    const denied = (): never => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    };
    const { config, warnings } = loadConfig({ path: 'c.toml', explicit: false, readFile: denied });
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual(['Cannot read c.toml: EACCES: permission denied. Using the defaults.']);
  });

  it('uses the label in messages', () => {
    expect(() =>
      loadConfig({ path: '/h/c.toml', label: '~/c.toml', explicit: true, readFile: enoent }),
    ).toThrow(/Cannot read config file ~\/c\.toml/);
  });

  it('parses the file it reads', () => {
    const { config } = loadConfig({ path: 'c.toml', explicit: false, readFile: () => 'view = "images"' });
    expect(config.view).toBe('images');
  });
});

describe('applyFlags', () => {
  const noFlags = { help: false, version: false };

  it('keeps the config when no flag is set', () => {
    expect(applyFlags(DEFAULT_CONFIG, noFlags)).toEqual(DEFAULT_CONFIG);
  });

  it('lets flags override the config', () => {
    const config = { ...DEFAULT_CONFIG, view: 'images' as const };
    expect(applyFlags(config, { ...noFlags, view: 'volumes', memory: 'absolute' })).toEqual({
      ...DEFAULT_CONFIG,
      view: 'volumes',
      memory: 'absolute',
    });
  });

  it('applies --theme', () => {
    expect(applyFlags(DEFAULT_CONFIG, { ...noFlags, theme: 'dracula' }).theme).toBe('dracula');
  });

  it('rejects an invalid --theme', () => {
    expect(() => applyFlags(DEFAULT_CONFIG, { ...noFlags, theme: 'neon' })).toThrow(/--theme must be one of/);
  });

  it('rejects an invalid --view', () => {
    expect(() => applyFlags(DEFAULT_CONFIG, { ...noFlags, view: 'logs' })).toThrow(/--view must be one of/);
  });

  it('rejects an invalid --memory', () => {
    expect(() => applyFlags(DEFAULT_CONFIG, { ...noFlags, memory: 'mb' })).toThrow(/--memory must be one of/);
  });
});

describe('resolvePalette', () => {
  it('returns the preset when there are no overrides', () => {
    expect(resolvePalette({ ...DEFAULT_CONFIG, theme: 'nord' }, PRESETS)).toEqual(PRESETS.nord);
  });

  it('applies overrides on top of the preset', () => {
    const palette = resolvePalette(
      { ...DEFAULT_CONFIG, theme: 'gruvbox', colors: { accent: '#ff00aa' } },
      PRESETS,
    );
    expect(palette).toEqual({ ...PRESETS.gruvbox, accent: '#ff00aa' });
  });
});

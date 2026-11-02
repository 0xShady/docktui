import { join } from 'path';
import { parseArgs } from 'util';
import { parse } from 'smol-toml';
import type { MemDisplay } from '@utils/status';

export const START_VIEWS = ['stacks', 'containers', 'images', 'volumes', 'networks'] as const;
export type StartView = (typeof START_VIEWS)[number];

const MEMORY_MODES: readonly MemDisplay[] = ['percent', 'absolute'];
const REFRESH_KEYS = ['containers', 'resources', 'stats'] as const;
type RefreshKey = (typeof REFRESH_KEYS)[number];

export interface Config {
  view: StartView;
  memory: MemDisplay;
  refresh: Record<RefreshKey, number>;
}

export const DEFAULT_CONFIG: Config = {
  view: 'stacks',
  memory: 'percent',
  refresh: { containers: 5, resources: 10, stats: 2 },
};

export interface Flags {
  config?: string;
  view?: string;
  memory?: string;
  help: boolean;
  version: boolean;
}

export interface ConfigResult {
  config: Config;
  warnings: string[];
}

export const HELP_TEXT = `Usage: docktui [options]

Options:
  -c, --config <path>   Config file (default: $XDG_CONFIG_HOME/docktui/config.toml,
                        or ~/.config/docktui/config.toml)
      --view <name>     View to open: ${START_VIEWS.join(', ')}
      --memory <mode>   Memory column: ${MEMORY_MODES.join(', ')}
  -h, --help            Show this help
  -v, --version         Show the version

Flags override the config file, which overrides the defaults.
`;

export function parseFlags(argv: string[]): Flags {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        config: { type: 'string', short: 'c' },
        view: { type: 'string' },
        memory: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
      allowPositionals: false,
    });
    return {
      config: values.config,
      view: values.view,
      memory: values.memory,
      help: values.help ?? false,
      version: values.version ?? false,
    };
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message : String(err)}. Run docktui --help.`);
  }
}

export function tildify(path: string, home: string): string {
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function configPath(env: NodeJS.ProcessEnv, home: string): string {
  const base = env.XDG_CONFIG_HOME || join(home, '.config');
  return join(base, 'docktui', 'config.toml');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value);

const isInterval = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 3600;

export function parseConfigFile(text: string, path: string): ConfigResult {
  let data: Record<string, unknown>;
  try {
    data = parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return { config: DEFAULT_CONFIG, warnings: [`${path}: ${reason}. Using the defaults.`] };
  }

  const warnings: string[] = [];
  const config: Config = { ...DEFAULT_CONFIG, refresh: { ...DEFAULT_CONFIG.refresh } };

  for (const [key, value] of Object.entries(data)) {
    if (key === 'view') {
      if (oneOf(value, START_VIEWS)) config.view = value;
      else warnings.push(`${path}: view must be one of ${START_VIEWS.join(', ')}.`);
    } else if (key === 'memory') {
      if (oneOf(value, MEMORY_MODES)) config.memory = value;
      else warnings.push(`${path}: memory must be one of ${MEMORY_MODES.join(', ')}.`);
    } else if (key === 'refresh' && isRecord(value)) {
      for (const [name, seconds] of Object.entries(value)) {
        if (!oneOf(name, REFRESH_KEYS)) warnings.push(`${path}: unknown key refresh.${name}.`);
        else if (isInterval(seconds)) config.refresh[name] = seconds;
        else warnings.push(`${path}: refresh.${name} must be a number of seconds between 1 and 3600.`);
      }
    } else if (key === 'refresh') {
      warnings.push(`${path}: refresh must be a table ([refresh]).`);
    } else {
      warnings.push(`${path}: unknown key ${key}.`);
    }
  }

  return { config, warnings };
}

export interface LoadOptions {
  path: string;
  label?: string;
  explicit: boolean;
  readFile: (path: string) => string;
}

export function loadConfig({ path, label = path, explicit, readFile }: LoadOptions): ConfigResult {
  let text: string;
  try {
    text = readFile(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const reason = err instanceof Error ? err.message : String(err);
    if (explicit) throw new Error(`Cannot read config file ${label}: ${reason}`);
    if (code === 'ENOENT') return { config: DEFAULT_CONFIG, warnings: [] };
    return { config: DEFAULT_CONFIG, warnings: [`Cannot read ${label}: ${reason}. Using the defaults.`] };
  }
  return parseConfigFile(text, label);
}

export function applyFlags(config: Config, flags: Flags): Config {
  const result: Config = { ...config, refresh: { ...config.refresh } };
  if (flags.view !== undefined) {
    if (!oneOf(flags.view, START_VIEWS)) throw new Error(`--view must be one of ${START_VIEWS.join(', ')}.`);
    result.view = flags.view;
  }
  if (flags.memory !== undefined) {
    if (!oneOf(flags.memory, MEMORY_MODES))
      throw new Error(`--memory must be one of ${MEMORY_MODES.join(', ')}.`);
    result.memory = flags.memory;
  }
  return result;
}

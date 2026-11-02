#!/usr/bin/env node
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { homedir } from 'os';
import { pingDocker } from '@docker/client';
import { App } from '@ui/app';
import { detectColors } from '@utils/term-caps';
import { PRESETS, applyTheme } from '@theme';
import {
  HELP_TEXT,
  applyFlags,
  configPath,
  loadConfig,
  parseFlags,
  resolvePalette,
  tildify,
} from '@utils/config';

const pkg = createRequire(__filename)('../package.json') as { version: string };

async function main(): Promise<void> {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  if (flags.version) {
    process.stdout.write(`${pkg.version}\n`);
    process.exit(0);
  }

  let config;
  let warnings: string[];
  try {
    const path = flags.config ?? configPath(process.env, homedir());
    const loaded = loadConfig({
      path,
      label: tildify(path, homedir()),
      explicit: flags.config !== undefined,
      readFile: (file) => readFileSync(file, 'utf8'),
    });
    config = applyFlags(loaded.config, flags);
    warnings = loaded.warnings;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  for (const warning of warnings) process.stderr.write(`${warning}\n`);
  applyTheme(resolvePalette(config, PRESETS));

  const colors = detectColors();
  if (colors === 'low') {
    process.stderr.write(
      'docktui requires a 256-color (or truecolor) terminal. Set TERM=xterm-256color or use a modern terminal emulator.\n',
    );
    process.exit(1);
  }

  try {
    await pingDocker();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  try {
    const app = new App({ config, notices: warnings });
    await app.start();
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

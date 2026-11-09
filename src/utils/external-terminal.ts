import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

export interface SpawnResult {
  ok: boolean;
  error?: string;
}

const SHELL_CMD = (id: string): string =>
  `docker exec -it ${id} sh -c 'command -v bash >/dev/null && exec bash || exec sh'`;

function which(cmd: string): boolean {
  try {
    const probe = platform() === 'win32' ? 'where' : 'which';
    const r = spawnSync(probe, [cmd], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function launch(cmd: string, args: string[]): SpawnResult {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function openOnMac(id: string): SpawnResult {
  const cmd = SHELL_CMD(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "Terminal"\nactivate\ndo script "${cmd}"\nend tell`;
  return launch('osascript', ['-e', script]);
}

function openOnWindows(id: string): SpawnResult {
  const cmd = SHELL_CMD(id);
  if (which('wt')) return launch('wt', ['cmd', '/k', cmd]);
  return launch('cmd', ['/c', 'start', '""', 'cmd', '/k', cmd]);
}

function openOnLinux(id: string): SpawnResult {
  const cmd = SHELL_CMD(id);
  const candidates = [
    process.env.TERMINAL,
    'x-terminal-emulator',
    'gnome-terminal',
    'konsole',
    'alacritty',
    'kitty',
    'wezterm',
    'tilix',
    'xterm',
  ].filter((t): t is string => Boolean(t));

  for (const term of candidates) {
    if (!which(term)) continue;
    const args =
      term === 'gnome-terminal' || term === 'tilix'
        ? ['--', 'sh', '-c', cmd]
        : term === 'wezterm'
          ? ['start', '--', 'sh', '-c', cmd]
          : term === 'kitty'
            ? ['sh', '-c', cmd]
            : ['-e', 'sh', '-c', cmd];
    return launch(term, args);
  }
  return {
    ok: false,
    error:
      'No terminal emulator found. Set $TERMINAL or install gnome-terminal, konsole, alacritty, kitty, or xterm.',
  };
}

export function openExternalShell(containerId: string): SpawnResult {
  if (!which('docker')) {
    return {
      ok: false,
      error:
        "The 'docker' CLI is not on your PATH. Install Docker or make sure it is in PATH to use shell-into-container.",
    };
  }
  switch (platform()) {
    case 'darwin':
      return openOnMac(containerId);
    case 'win32':
      return openOnWindows(containerId);
    default:
      return openOnLinux(containerId);
  }
}

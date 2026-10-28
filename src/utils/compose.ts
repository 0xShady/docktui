import type { ContainerInfo } from '@models/docker';

export type ComposeVerb = 'up' | 'down' | 'restart' | 'pull' | 'build';

export interface ComposeProject {
  name: string;
  workingDir: string;
  configFiles: string[];
}

const PROJECT_LABEL = 'com.docker.compose.project';
const WORKING_DIR_LABEL = 'com.docker.compose.project.working_dir';
const CONFIG_FILES_LABEL = 'com.docker.compose.project.config_files';

const VERB_ARGS: Record<ComposeVerb, string[]> = {
  up: ['up', '-d'],
  down: ['down'],
  restart: ['restart'],
  pull: ['pull', '--ignore-buildable'],
  build: ['up', '--build', '-d'],
};

export const COMPOSE_VERB_LABEL: Record<ComposeVerb, string> = {
  up: 'up',
  down: 'down',
  restart: 'restart',
  pull: 'pull',
  build: 'up --build',
};

export function composeProjectOf(services: ContainerInfo[]): ComposeProject | null {
  for (const c of services) {
    const name = c.labels[PROJECT_LABEL];
    const workingDir = c.labels[WORKING_DIR_LABEL];
    if (!name || !workingDir) continue;
    const configFiles = (c.labels[CONFIG_FILES_LABEL] ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    return { name, workingDir, configFiles };
  }
  return null;
}

export function composeArgs(project: ComposeProject, verb: ComposeVerb): string[] {
  return [
    'compose',
    '-p',
    project.name,
    '--project-directory',
    project.workingDir,
    ...project.configFiles.flatMap((f) => ['-f', f]),
    ...VERB_ARGS[verb],
  ];
}

export function lastOutputLine(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

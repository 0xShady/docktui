import { describe, it, expect } from 'vitest';
import type { ContainerInfo, ContainerStatus } from '@models/docker';
import { composeArgs, composeProjectOf, lastOutputLine, type ComposeProject } from '@utils/compose';

function container(labels: Record<string, string> = {}): ContainerInfo {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'svc',
    image: 'alpine:latest',
    status: 'running' as ContainerStatus,
    exitCode: 0,
    uptime: '5m 0s',
    ports: [],
    networks: [],
    ip: '',
    mounts: [],
    env: [],
    restartPolicy: 'no',
    pids: 0,
    labels,
  };
}

const composeLabels = {
  'com.docker.compose.project': 'acme',
  'com.docker.compose.project.working_dir': '/home/me/acme',
  'com.docker.compose.project.config_files': '/home/me/acme/compose.yml,/home/me/acme/compose.override.yml',
};

describe('composeProjectOf', () => {
  it('reads the project, working directory and every config file from the labels', () => {
    expect(composeProjectOf([container(composeLabels)])).toEqual({
      name: 'acme',
      workingDir: '/home/me/acme',
      configFiles: ['/home/me/acme/compose.yml', '/home/me/acme/compose.override.yml'],
    });
  });

  it('skips containers without the labels and uses the first one that has them', () => {
    expect(composeProjectOf([container(), container(composeLabels)])?.name).toBe('acme');
  });

  it('returns null when no container carries a project and working directory', () => {
    expect(composeProjectOf([container()])).toBeNull();
    expect(composeProjectOf([container({ 'com.docker.compose.project': 'acme' })])).toBeNull();
    expect(composeProjectOf([])).toBeNull();
  });

  it('allows a project without config files (compose defaults to the working directory)', () => {
    const { 'com.docker.compose.project.config_files': _files, ...noFiles } = composeLabels;
    expect(composeProjectOf([container(noFiles)])?.configFiles).toEqual([]);
  });
});

describe('composeArgs', () => {
  const project: ComposeProject = {
    name: 'acme',
    workingDir: '/home/me/acme',
    configFiles: ['/home/me/acme/compose.yml'],
  };
  const base = [
    'compose',
    '-p',
    'acme',
    '--project-directory',
    '/home/me/acme',
    '-f',
    '/home/me/acme/compose.yml',
  ];

  it('builds each verb against the project, its directory and its files', () => {
    expect(composeArgs(project, 'up')).toEqual([...base, 'up', '-d']);
    expect(composeArgs(project, 'down')).toEqual([...base, 'down']);
    expect(composeArgs(project, 'restart')).toEqual([...base, 'restart']);
    expect(composeArgs(project, 'pull')).toEqual([...base, 'pull', '--ignore-buildable']);
    expect(composeArgs(project, 'build')).toEqual([...base, 'up', '--build', '-d']);
  });

  it('passes one -f per config file and none when there are none', () => {
    const two = { ...project, configFiles: ['a.yml', 'b.yml'] };
    expect(composeArgs(two, 'up')).toEqual([
      'compose',
      '-p',
      'acme',
      '--project-directory',
      '/home/me/acme',
      '-f',
      'a.yml',
      '-f',
      'b.yml',
      'up',
      '-d',
    ]);
    expect(composeArgs({ ...project, configFiles: [] }, 'down')).toEqual([
      'compose',
      '-p',
      'acme',
      '--project-directory',
      '/home/me/acme',
      'down',
    ]);
  });
});

describe('lastOutputLine', () => {
  it('returns the last non-empty line', () => {
    expect(lastOutputLine(' Container a  Started\nError: no such service: web\n\n')).toBe(
      'Error: no such service: web',
    );
    expect(lastOutputLine('one\r\ntwo\r\n')).toBe('two');
  });

  it('returns null for empty output', () => {
    expect(lastOutputLine('')).toBeNull();
    expect(lastOutputLine('\n  \n')).toBeNull();
  });
});

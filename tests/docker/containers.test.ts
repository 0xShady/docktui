import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toContainerInfo } from '@docker/containers';
import type Dockerode from 'dockerode';

function rawContainer(overrides: Partial<Dockerode.ContainerInfo> = {}): Dockerode.ContainerInfo {
  return {
    Id: 'abc123',
    Names: ['/test-container'],
    Image: 'nginx:latest',
    ImageID: 'sha256:img',
    Command: '',
    Created: 0,
    Ports: [],
    Labels: {},
    State: 'running',
    Status: 'Up 5 minutes',
    HostConfig: { NetworkMode: 'default' },
    NetworkSettings: { Networks: {} },
    Mounts: [],
    ...overrides,
  } as Dockerode.ContainerInfo;
}

function inspected(overrides: {
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  pid?: number;
  env?: string[];
  restart?: string;
}): Dockerode.ContainerInspectInfo {
  return {
    State: {
      StartedAt: overrides.startedAt ?? '0001-01-01T00:00:00Z',
      FinishedAt: overrides.finishedAt ?? '0001-01-01T00:00:00Z',
      ExitCode: overrides.exitCode ?? 0,
      Pid: overrides.pid ?? 0,
    },
    Config: { Env: overrides.env ?? [] },
    HostConfig: { RestartPolicy: { Name: overrides.restart ?? 'no' } },
  } as any;
}

describe('toContainerInfo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('strips the leading slash from container name', () => {
    const info = toContainerInfo(rawContainer({ Names: ['/my-app'] }), null);
    expect(info.name).toBe('my-app');
  });

  it('falls back to raw.Id when Names is empty', () => {
    const info = toContainerInfo(rawContainer({ Names: [], Id: 'deadbeef' }), null);
    expect(info.name).toBe('deadbeef');
  });

  it('keeps valid statuses as-is', () => {
    const info = toContainerInfo(rawContainer({ State: 'paused' }), null);
    expect(info.status).toBe('paused');
  });

  it('coerces unknown statuses to "exited"', () => {
    const info = toContainerInfo(rawContainer({ State: 'unknown-future-state' }), null);
    expect(info.status).toBe('exited');
  });

  it('uses raw.Status as uptime when not inspected', () => {
    const info = toContainerInfo(rawContainer({ Status: 'Up 5 minutes' }), null);
    expect(info.uptime).toBe('Up 5 minutes');
  });

  it('derives uptime from StartedAt when running and inspected', () => {
    const fiveMinutesAgo = new Date('2026-05-14T11:55:00Z').toISOString();
    const info = toContainerInfo(
      rawContainer({ State: 'running' }),
      inspected({ startedAt: fiveMinutesAgo }),
    );
    expect(info.uptime).toBe('5m 0s');
  });

  it('derives uptime from FinishedAt when exited', () => {
    const oneHourAgo = new Date('2026-05-14T11:00:00Z').toISOString();
    const info = toContainerInfo(
      rawContainer({ State: 'exited' }),
      inspected({ finishedAt: oneHourAgo, exitCode: 137 }),
    );
    expect(info.uptime).toMatch(/hour ago/);
    expect(info.exitCode).toBe(137);
  });

  it('falls back to raw.Status when FinishedAt is the epoch-zero sentinel', () => {
    const info = toContainerInfo(
      rawContainer({ State: 'exited', Status: 'Exited (0) just now' }),
      inspected({ finishedAt: '0001-01-01T00:00:00Z' }),
    );
    expect(info.uptime).toBe('Exited (0) just now');
  });

  it('falls back to raw.Status when StartedAt is the epoch-zero sentinel', () => {
    const info = toContainerInfo(
      rawContainer({ State: 'running', Status: 'Up' }),
      inspected({ startedAt: '0001-01-01T00:00:00Z' }),
    );
    expect(info.uptime).toBe('Up');
  });

  it('formats ports with IP, public, and private', () => {
    const info = toContainerInfo(
      rawContainer({
        Ports: [{ IP: '0.0.0.0', PublicPort: 8080, PrivatePort: 80, Type: 'tcp' }],
      }),
      null,
    );
    expect(info.ports).toEqual(['0.0.0.0:8080->80/tcp']);
  });

  it('formats internal-only ports without ip/public', () => {
    const info = toContainerInfo(rawContainer({ Ports: [{ PrivatePort: 3000, Type: 'tcp' }] }), null);
    expect(info.ports).toEqual(['3000/tcp']);
  });

  it('treats null Ports (Docker 29, no published ports) as no ports', () => {
    const raw = rawContainer({ Ports: null as unknown as Dockerode.ContainerInfo['Ports'] });
    expect(toContainerInfo(raw, null).ports).toEqual([]);
  });

  it('extracts networks and first IP', () => {
    const info = toContainerInfo(
      rawContainer({
        NetworkSettings: {
          Networks: {
            bridge: { IPAddress: '172.17.0.2' },
          } as any,
        },
      }),
      null,
    );
    expect(info.networks).toEqual(['bridge']);
    expect(info.ip).toBe('172.17.0.2');
  });

  it('returns empty IP when no networks', () => {
    const info = toContainerInfo(rawContainer({ NetworkSettings: { Networks: {} } }), null);
    expect(info.networks).toEqual([]);
    expect(info.ip).toBe('');
  });

  it('maps mounts', () => {
    const info = toContainerInfo(
      rawContainer({
        Mounts: [
          {
            Source: '/host/data',
            Destination: '/data',
            Mode: 'rw',
            RW: true,
            Type: 'bind',
          } as any,
        ],
      }),
      null,
    );
    expect(info.mounts).toEqual([
      { source: '/host/data', destination: '/data', mode: 'rw', rw: true, type: 'bind' },
    ]);
  });

  it('pulls env, restartPolicy, and pids from inspect when present', () => {
    const info = toContainerInfo(
      rawContainer({ State: 'running' }),
      inspected({
        startedAt: '2026-05-14T11:55:00Z',
        env: ['FOO=bar', 'BAZ=qux'],
        restart: 'unless-stopped',
        pid: 4242,
      }),
    );
    expect(info.env).toEqual(['FOO=bar', 'BAZ=qux']);
    expect(info.restartPolicy).toBe('unless-stopped');
    expect(info.pids).toBe(4242);
  });

  it('defaults env/restartPolicy/pids when inspect is null', () => {
    const info = toContainerInfo(rawContainer(), null);
    expect(info.env).toEqual([]);
    expect(info.restartPolicy).toBe('no');
    expect(info.pids).toBe(0);
  });

  it('exposes container labels from the raw payload', () => {
    const info = toContainerInfo(
      rawContainer({
        Labels: {
          'com.docker.compose.project': 'alphie',
          'com.docker.compose.service': 'web',
        },
      }),
      null,
    );
    expect(info.labels).toEqual({
      'com.docker.compose.project': 'alphie',
      'com.docker.compose.service': 'web',
    });
  });

  it('defaults labels to an empty object when raw.Labels is missing', () => {
    const info = toContainerInfo(
      rawContainer({ Labels: undefined as unknown as Record<string, string> }),
      null,
    );
    expect(info.labels).toEqual({});
  });
});

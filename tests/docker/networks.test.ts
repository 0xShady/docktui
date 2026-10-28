import { describe, it, expect } from 'vitest';
import { countContainersByNetwork, toNetworkInfo } from '@docker/networks';
import type Dockerode from 'dockerode';

function rawNetwork(overrides: Partial<Dockerode.NetworkInspectInfo> = {}): Dockerode.NetworkInspectInfo {
  return {
    Name: 'my-network',
    Id: 'a1b2c3d4e5f60718293a4b5c6d7e8f900112233445566778899aabbccddeeff0',
    Created: '2026-05-14T12:00:00.000Z',
    Scope: 'local',
    Driver: 'bridge',
    EnableIPv6: false,
    Internal: false,
    Attachable: false,
    Ingress: false,
    ConfigOnly: false,
    ...overrides,
  } as Dockerode.NetworkInspectInfo;
}

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

/** A container attached to the given networks (by name), with an optional endpoint NetworkID. */
function containerOn(
  networkNames: string[],
  state = 'running',
  networkId = 'net-id',
): Dockerode.ContainerInfo {
  const Networks: Record<string, { NetworkID: string }> = {};
  for (const name of networkNames) Networks[name] = { NetworkID: networkId };
  return rawContainer({
    State: state,
    NetworkSettings: { Networks } as unknown as Dockerode.ContainerInfo['NetworkSettings'],
  });
}

describe('toNetworkInfo', () => {
  it('maps the core identity fields', () => {
    const info = toNetworkInfo(rawNetwork({ Id: 'net-id', Name: 'app_default' }), 0);
    expect(info.id).toBe('net-id');
    expect(info.name).toBe('app_default');
  });

  it('maps driver and scope', () => {
    const info = toNetworkInfo(rawNetwork({ Driver: 'overlay', Scope: 'swarm' }), 0);
    expect(info.driver).toBe('overlay');
    expect(info.scope).toBe('swarm');
  });

  it('defaults driver and scope to empty strings when missing', () => {
    const info = toNetworkInfo(
      rawNetwork({
        Driver: undefined as unknown as string,
        Scope: undefined as unknown as string,
      }),
      0,
    );
    expect(info.driver).toBe('');
    expect(info.scope).toBe('');
  });

  it('parses the Created timestamp', () => {
    const info = toNetworkInfo(rawNetwork({ Created: '2026-05-14T12:00:00.000Z' }), 0);
    expect(info.created.toISOString()).toBe('2026-05-14T12:00:00.000Z');
  });

  it('falls back to epoch zero when Created is absent', () => {
    const info = toNetworkInfo(rawNetwork({ Created: '' }), 0);
    expect(info.created.getTime()).toBe(0);
  });

  it('passes through the attached-container count', () => {
    expect(toNetworkInfo(rawNetwork(), 3).containerCount).toBe(3);
  });

  it('marks a network in use when it has attached containers (any state)', () => {
    expect(toNetworkInfo(rawNetwork(), 1).inUse).toBe(true);
    expect(toNetworkInfo(rawNetwork(), 0).inUse).toBe(false);
  });

  it('flags the predefined bridge / host / none networks as built-in', () => {
    expect(toNetworkInfo(rawNetwork({ Name: 'bridge' }), 0).builtin).toBe(true);
    expect(toNetworkInfo(rawNetwork({ Name: 'host' }), 0).builtin).toBe(true);
    expect(toNetworkInfo(rawNetwork({ Name: 'none' }), 0).builtin).toBe(true);
  });

  it('does not flag user-defined networks as built-in', () => {
    expect(toNetworkInfo(rawNetwork({ Name: 'app_default' }), 0).builtin).toBe(false);
  });
});

describe('countContainersByNetwork', () => {
  it('tallies every attached container per network, keyed by name', () => {
    const counts = countContainersByNetwork([containerOn(['app']), containerOn(['app'])]);
    expect(counts.get('app')).toBe(2);
  });

  it('counts by network name even when the endpoint NetworkID is stale or blank', () => {
    // A stopped container on the default bridge keeps a NetworkID pointing at the
    // pre-restart bridge; keying by name must still attribute it to `bridge`.
    const counts = countContainersByNetwork([
      containerOn(['bridge'], 'exited', 'stale-old-bridge-id'),
      containerOn(['bridge'], 'exited', ''),
    ]);
    expect(counts.get('bridge')).toBe(2);
  });

  it('counts attached containers regardless of state (running or stopped)', () => {
    const counts = countContainersByNetwork([
      containerOn(['app'], 'running'),
      containerOn(['app'], 'exited'),
      containerOn(['app'], 'created'),
    ]);
    expect(counts.get('app')).toBe(3);
  });

  it('counts a single container attached to multiple networks once each', () => {
    const counts = countContainersByNetwork([containerOn(['a', 'b'])]);
    expect(counts.get('a')).toBe(1);
    expect(counts.get('b')).toBe(1);
  });

  it('ignores containers with no attached networks', () => {
    const counts = countContainersByNetwork([rawContainer({ NetworkSettings: { Networks: {} } })]);
    expect(counts.size).toBe(0);
  });
});

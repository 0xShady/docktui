import type Dockerode from 'dockerode';
import { dockerode } from '@docker/client';
import type { NetworkInfo } from '@models/docker';

// Docker's predefined networks can never be removed.
const BUILTIN_NETWORKS = new Set(['bridge', 'host', 'none']);

/**
 * Tally how many containers are attached to each network, keyed by network NAME.
 *
 * We key by name (the `NetworkSettings.Networks` map key), not the endpoint's
 * `NetworkID`: a stopped container can carry a *stale* NetworkID — the default
 * `bridge` network is recreated with a fresh ID on daemon restart, so an exited
 * container keeps pointing at the old ID and would never match the live network.
 * Docker forbids two networks sharing a name on one daemon, so the name is a
 * stable, unique key; it is also what the Containers view stores/shows
 * (`toContainerInfo`), keeping the two views consistent. Counts every attached
 * container regardless of state, like images/volumes derive their in-use flag
 * from `listContainers({ all: true })`.
 */
export function countContainersByNetwork(rawContainers: Dockerode.ContainerInfo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of rawContainers) {
    for (const name of Object.keys(c.NetworkSettings?.Networks ?? {})) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

export function toNetworkInfo(raw: Dockerode.NetworkInspectInfo, containerCount: number): NetworkInfo {
  return {
    id: raw.Id,
    name: raw.Name,
    driver: raw.Driver ?? '',
    scope: raw.Scope ?? '',
    created: raw.Created ? new Date(raw.Created) : new Date(0),
    containerCount,
    inUse: containerCount > 0,
    builtin: BUILTIN_NETWORKS.has(raw.Name),
  };
}

export async function listNetworks(): Promise<NetworkInfo[]> {
  try {
    const [rawNetworks, rawContainers] = await Promise.all([
      dockerode.listNetworks(),
      dockerode.listContainers({ all: true }),
    ]);

    const counts = countContainersByNetwork(rawContainers);

    return rawNetworks
      .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''))
      .map((net) => toNetworkInfo(net, counts.get(net.Name) ?? 0));
  } catch (err) {
    throw new Error(`Failed to list networks: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function removeNetwork(id: string): Promise<void> {
  try {
    await dockerode.getNetwork(id).remove();
  } catch (err) {
    throw new Error(`Failed to remove network ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

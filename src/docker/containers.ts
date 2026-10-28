import type Dockerode from 'dockerode';
import { dockerode } from '@docker/client';
import type { ContainerInfo, ContainerStats, ContainerStatus, MountInfo } from '@models/docker';
import { humanUptime, relativeTime } from '@utils/format';
import { calcCPUPercent } from '@utils/stats';

const VALID_STATUSES = new Set<ContainerStatus>([
  'running',
  'paused',
  'exited',
  'restarting',
  'dead',
  'created',
  'removing',
]);

export function toContainerInfo(
  raw: Dockerode.ContainerInfo,
  inspected: Dockerode.ContainerInspectInfo | null,
): ContainerInfo {
  const name = (raw.Names[0] ?? raw.Id).replace(/^\//, '');

  const status: ContainerStatus = VALID_STATUSES.has(raw.State as ContainerStatus)
    ? (raw.State as ContainerStatus)
    : 'exited';

  let uptime = raw.Status;
  if (inspected) {
    if (status === 'running' || status === 'paused' || status === 'restarting') {
      const startedAt = new Date(inspected.State.StartedAt);
      if (startedAt.getTime() > 0) uptime = humanUptime(startedAt);
    } else if (status === 'exited' || status === 'dead') {
      const finishedAt = new Date(inspected.State.FinishedAt);
      if (finishedAt.getTime() > 0) uptime = relativeTime(finishedAt);
    }
  }

  const ports = (raw.Ports ?? []).map((p) =>
    p.PublicPort
      ? `${p.IP ? `${p.IP}:` : ''}${p.PublicPort}->${p.PrivatePort}/${p.Type}`
      : `${p.PrivatePort}/${p.Type}`,
  );

  const networks = Object.keys(raw.NetworkSettings.Networks ?? {});
  const ip = networks.length > 0 ? (raw.NetworkSettings.Networks[networks[0]]?.IPAddress ?? '') : '';

  const mounts: MountInfo[] = (raw.Mounts ?? []).map((m) => ({
    source: m.Source ?? '',
    destination: m.Destination ?? '',
    mode: m.Mode ?? '',
    rw: m.RW ?? false,
    type: (m.Type as MountInfo['type']) ?? 'bind',
  }));

  return {
    id: raw.Id,
    name,
    image: raw.Image,
    status,
    exitCode: inspected?.State?.ExitCode ?? 0,
    uptime,
    ports,
    networks,
    ip,
    mounts,
    env: inspected?.Config?.Env ?? [],
    restartPolicy: inspected?.HostConfig?.RestartPolicy?.Name ?? 'no',
    pids: inspected?.State?.Pid ?? 0,
    labels: raw.Labels ?? {},
  };
}

export async function listContainers(): Promise<ContainerInfo[]> {
  try {
    const rawList = await dockerode.listContainers({ all: true });
    return await Promise.all(
      rawList.map(async (raw) => {
        let inspected: Dockerode.ContainerInspectInfo | null = null;
        try {
          inspected = await dockerode.getContainer(raw.Id).inspect();
        } catch {
          // Fall back to list data if inspect fails
        }
        return toContainerInfo(raw, inspected);
      }),
    );
  } catch (err) {
    throw new Error(`Failed to list containers: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toContainerStats(stats: any): ContainerStats {
  const usage: number = stats.memory_stats.usage;
  const limit: number = stats.memory_stats.limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blkio: any[] = stats.blkio_stats?.io_service_bytes_recursive ?? [];
  const readBytes = blkio
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.op === 'Read' || b.op === 'read')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((sum: number, b: any) => sum + (b.value ?? 0), 0);
  const writeBytes = blkio
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.op === 'Write' || b.op === 'write')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((sum: number, b: any) => sum + (b.value ?? 0), 0);

  return {
    cpuPercent: calcCPUPercent(stats),
    memUsageMB: usage / 1024 / 1024,
    memLimitMB: limit / 1024 / 1024,
    memPercent: limit > 0 ? (usage / limit) * 100 : 0,
    diskReadMB: readBytes / 1024 / 1024,
    diskWriteMB: writeBytes / 1024 / 1024,
  };
}

export async function fetchStats(id: string): Promise<ContainerStats> {
  try {
    const stats = await dockerode.getContainer(id).stats({ stream: false });
    return toContainerStats(stats);
  } catch (err) {
    throw new Error(
      `Failed to fetch stats for container ${id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function startContainer(id: string): Promise<void> {
  try {
    await dockerode.getContainer(id).start();
  } catch (err) {
    throw new Error(`Failed to start container ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function stopContainer(id: string): Promise<void> {
  try {
    await dockerode.getContainer(id).stop();
  } catch (err) {
    throw new Error(`Failed to stop container ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function restartContainer(id: string): Promise<void> {
  try {
    await dockerode.getContainer(id).restart();
  } catch (err) {
    throw new Error(`Failed to restart container ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function killContainer(id: string): Promise<void> {
  try {
    await dockerode.getContainer(id).kill();
  } catch (err) {
    throw new Error(`Failed to kill container ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function removeContainer(id: string): Promise<void> {
  try {
    await dockerode.getContainer(id).remove({ force: true });
  } catch (err) {
    throw new Error(`Failed to remove container ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function streamLogs(id: string, tail: number): Promise<NodeJS.ReadableStream> {
  try {
    return await dockerode.getContainer(id).logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    });
  } catch (err) {
    throw new Error(
      `Failed to stream logs for container ${id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

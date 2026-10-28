import type { ContainerInfo } from '@models/docker';
import { composeProjectOf, type ComposeProject } from '@utils/compose';

export const NO_STACK = '(no stack)';
const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';
const DEFAULT_NETWORK_SUFFIX = '_default';

export interface StackCounts {
  running: number;
  errored: number;
  stopped: number;
}

export interface Stack {
  id: string;
  isCompose: boolean;
  services: ContainerInfo[];
  counts: StackCounts;
  isLive: boolean;
  compose: ComposeProject | null;
}

export type ServiceClass = 'running' | 'errored' | 'stopped';

export function classifyContainer(c: ContainerInfo): ServiceClass {
  if (c.status === 'running' || c.status === 'paused' || c.status === 'restarting') {
    return 'running';
  }
  if ((c.status === 'exited' || c.status === 'dead') && c.exitCode !== 0) {
    return 'errored';
  }
  return 'stopped';
}

function detectStack(c: ContainerInfo): { id: string; isCompose: boolean } {
  const labeled = c.labels[COMPOSE_PROJECT_LABEL];
  if (labeled) return { id: labeled, isCompose: true };
  for (const net of c.networks) {
    if (net.endsWith(DEFAULT_NETWORK_SUFFIX)) {
      return { id: net.slice(0, -DEFAULT_NETWORK_SUFFIX.length), isCompose: true };
    }
  }

  return { id: NO_STACK, isCompose: false };
}

const CLASS_ORDER: Record<ServiceClass, number> = { running: 0, errored: 1, stopped: 2 };

function compareServices(a: ContainerInfo, b: ContainerInfo): number {
  const ca = CLASS_ORDER[classifyContainer(a)];
  const cb = CLASS_ORDER[classifyContainer(b)];
  if (ca !== cb) return ca - cb;
  return a.name.localeCompare(b.name);
}

export function isDown(stack: Stack): boolean {
  return stack.services.length === 0;
}

export function groupIntoStacks(containers: ContainerInfo[], knownProjects: ComposeProject[] = []): Stack[] {
  const grouped = new Map<string, { isCompose: boolean; services: ContainerInfo[] }>();

  for (const c of containers) {
    const { id, isCompose } = detectStack(c);
    const existing = grouped.get(id);
    if (existing) {
      existing.services.push(c);
      if (isCompose) existing.isCompose = true;
    } else {
      grouped.set(id, { isCompose, services: [c] });
    }
  }

  const stacks: Stack[] = [];
  for (const [id, { isCompose, services }] of grouped) {
    const counts: StackCounts = { running: 0, errored: 0, stopped: 0 };
    for (const c of services) counts[classifyContainer(c)]++;
    stacks.push({
      id,
      isCompose,
      services: [...services].sort(compareServices),
      counts,
      isLive: counts.running > 0,
      compose: composeProjectOf(services),
    });
  }

  for (const project of knownProjects) {
    if (grouped.has(project.name)) continue;
    stacks.push({
      id: project.name,
      isCompose: true,
      services: [],
      counts: { running: 0, errored: 0, stopped: 0 },
      isLive: false,
      compose: project,
    });
  }

  stacks.sort((a, b) => {
    if (a.id === NO_STACK && b.id !== NO_STACK) return 1;
    if (b.id === NO_STACK && a.id !== NO_STACK) return -1;
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    if (a.isLive) return b.counts.running - a.counts.running;
    return b.services.length - a.services.length;
  });

  return stacks;
}

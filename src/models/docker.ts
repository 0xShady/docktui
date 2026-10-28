export interface MountInfo {
  source: string;
  destination: string;
  mode: string;
  rw: boolean;
  type: 'bind' | 'volume' | 'tmpfs';
}

export type ContainerStatus =
  | 'running'
  | 'paused'
  | 'exited'
  | 'restarting'
  | 'dead'
  | 'created'
  | 'removing';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  exitCode: number;
  uptime: string;
  ports: string[];
  networks: string[];
  ip: string;
  mounts: MountInfo[];
  env: string[];
  restartPolicy: string;
  pids: number;
  labels: Record<string, string>;
}

export interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  sizeMB: number;
  created: Date;
  inUse: boolean;
}

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  created: Date;
  sizeMB: number;
  inUse: boolean;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  created: Date;
  containerCount: number;
  inUse: boolean;
  builtin: boolean;
}

export interface ContainerStats {
  cpuPercent: number;
  memUsageMB: number;
  memLimitMB: number;
  memPercent: number;
  diskReadMB: number;
  diskWriteMB: number;
}

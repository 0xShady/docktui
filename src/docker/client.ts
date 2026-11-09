import { existsSync } from 'node:fs';
import Dockerode from 'dockerode';

let socketLabel = '';

function createDockerode(): Dockerode {
  // Honor DOCKER_HOST when set (rootless docker, podman, remote daemons).
  // Supported forms: unix:///path/to/sock, npipe:////./pipe/name, tcp://host:port
  const host = process.env.DOCKER_HOST;
  if (host) {
    if (host.startsWith('unix://')) {
      const sock = host.slice('unix://'.length);
      socketLabel = `unix://${sock}`;
      return new Dockerode({ socketPath: sock });
    }
    if (host.startsWith('npipe://')) {
      const sock = host.slice('npipe://'.length);
      socketLabel = `npipe://${sock}`;
      return new Dockerode({ socketPath: sock });
    }
    if (host.startsWith('tcp://') || host.startsWith('http://') || host.startsWith('https://')) {
      const url = new URL(host);
      socketLabel = host;
      return new Dockerode({
        host: url.hostname,
        port: Number(url.port) || (url.protocol === 'https:' ? 2376 : 2375),
        protocol: url.protocol === 'https:' ? 'https' : 'http',
      });
    }
    throw new Error(
      `Unrecognized DOCKER_HOST scheme: '${host}'. Expected unix://…, npipe://…, tcp://…, http://…, or https://…`,
    );
  }

  if (process.platform === 'win32') {
    socketLabel = 'npipe:////./pipe/docker_engine';
    return new Dockerode({ socketPath: '//./pipe/docker_engine' });
  }

  // macOS Docker Desktop sometimes only exposes the per-user socket; prefer it when present.
  const userSock = `${process.env.HOME ?? ''}/.docker/run/docker.sock`;
  if (process.platform === 'darwin' && process.env.HOME && existsSync(userSock)) {
    socketLabel = `unix://${userSock}`;
    return new Dockerode({ socketPath: userSock });
  }

  socketLabel = 'unix:///var/run/docker.sock';
  return new Dockerode({ socketPath: '/var/run/docker.sock' });
}

export const dockerode = createDockerode();

export function getDockerSocketLabel(): string {
  return socketLabel;
}

export async function pingDocker(): Promise<void> {
  try {
    await dockerode.ping();
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/EACCES|permission denied/i.test(raw) && process.platform === 'linux') {
      throw new Error(
        `Cannot access the Docker socket (permission denied). Add your user to the 'docker' group: sudo usermod -aG docker $USER (then log out and back in). (${raw})`,
      );
    }
    throw new Error(
      `Docker is not running or not accessible. Make sure the Docker daemon is started. (${raw})`,
    );
  }
}

export async function getDockerVersion(): Promise<string> {
  try {
    const info = (await dockerode.version()) as { Version?: string };
    return String(info?.Version ?? '');
  } catch {
    return 'unknown';
  }
}

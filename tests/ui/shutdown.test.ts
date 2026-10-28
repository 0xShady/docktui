import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

function fakeDocker(onContainerList: () => void): http.Server {
  return http.createServer((req, res) => {
    const send = (body: unknown) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    const url = req.url ?? '';
    if (url.includes('/version')) return send({ Version: '27.0.0', ApiVersion: '1.47' });
    if (url.includes('/containers/json')) {
      onContainerList();
      return setTimeout(() => send([]), 1000);
    }
    if (url.includes('/volumes')) return send({ Volumes: [] });
    send([]);
  });
}

describe.skipIf(process.platform === 'win32')('shutdown', () => {
  it('exits when SIGTERM arrives during the first poll', async () => {
    let signalled = false;
    let kill: () => void = () => {};
    const server = fakeDocker(() => {
      if (!signalled) {
        signalled = true;
        kill();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const child = spawn(
      process.execPath,
      ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'src/cli.ts'],
      {
        cwd: root,
        env: {
          ...process.env,
          DOCKER_HOST: `tcp://127.0.0.1:${port}`,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          TS_NODE_TRANSPILE_ONLY: '1',
        },
        stdio: 'pipe',
      },
    );
    kill = () => child.kill('SIGTERM');

    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ code: null, signal: 'SIGKILL' });
      }, 10_000);
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    server.close();

    expect(signalled).toBe(true);
    expect(exit).toEqual({ code: 0, signal: null });
  }, 20_000);
});

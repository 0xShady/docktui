import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { composeArgs, lastOutputLine, type ComposeProject, type ComposeVerb } from '@utils/compose';

const OUTPUT_TAIL = 4000;

export function runCompose(project: ComposeProject, verb: ComposeVerb): Promise<void> {
  const missing = [project.workingDir, ...project.configFiles].find((p) => !existsSync(p));
  if (missing) {
    return Promise.reject(new Error(`Compose files for ${project.name} are not on this machine: ${missing}`));
  }

  return new Promise((resolve, reject) => {
    const child = spawn('docker', composeArgs(project, verb), { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          err.code === 'ENOENT'
            ? "The 'docker' CLI is not on your PATH. Install Docker or make sure it is in PATH to run compose commands."
            : `docker compose ${verb} failed for ${project.name}: ${err.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const last = lastOutputLine(output) ?? `exit code ${code ?? 'unknown'}`;
      reject(new Error(`docker compose ${verb} failed for ${project.name}: ${last}`));
    });
  });
}

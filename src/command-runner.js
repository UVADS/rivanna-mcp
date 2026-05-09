import { spawn } from 'child_process';

export function execCommand(command, args, { timeout = 30000, errorPrefix = 'Command failed' } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data;
    });

    proc.stderr.on('data', (data) => {
      stderr += data;
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`Command timed out after ${timeout}ms`));
      } else if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${errorPrefix}: ${stderr || `exit code ${code}`}`));
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

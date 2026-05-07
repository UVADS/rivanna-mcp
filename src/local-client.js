import { spawn } from 'child_process';

class LocalClient {
  constructor() {
    // No parameters needed for local execution
  }

  async exec(command, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const proc = spawn('/bin/bash', ['-c', command], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

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
          reject(new Error(`Command failed: ${stderr || `exit code ${code}`}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  close() {
    // No persistent connection, nothing to close
  }
}

export default LocalClient;

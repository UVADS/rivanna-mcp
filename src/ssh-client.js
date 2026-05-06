import { spawn } from 'child_process';

class SSHClient {
  constructor(host, username, privateKeyPath) {
    this.host = host;
    this.username = username;
    this.privateKeyPath = privateKeyPath;
  }

  async exec(command, timeout = 30000) {
    const args = [
      '-i', this.privateKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'BatchMode=yes',
      '-o', 'KexAlgorithms=sntrup761x25519-sha512@openssh.com,curve25519-sha256,diffie-hellman-group14-sha256',
      `${this.username}@${this.host}`,
      command,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
          reject(new Error(`SSH command failed: ${stderr || `exit code ${code}`}`));
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

export default SSHClient;

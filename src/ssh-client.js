import { execCommand } from './command-runner.js';
import { statSync, readFileSync } from 'fs';
import { spawn } from 'child_process';

class SSHClient {
  constructor(host = 'login.hpc.virginia.edu', username, privateKeyPath) {
    this.host = host;
    this.username = username;
    this.privateKeyPath = privateKeyPath;
  }

  getSSHOptions() {
    return [
      '-i', this.privateKeyPath,
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'BatchMode=yes',
    ];
  }

  async exec(command, timeout = 30000) {
    const args = [...this.getSSHOptions(), `${this.username}@${this.host}`, command];
    return execCommand('ssh', args, { timeout, errorPrefix: 'SSH command failed' });
  }

  async transferFile(localPath, remotePath, timeout = 60000) {
    const localStats = statSync(localPath);
    const localFileSize = localStats.size;
    const localFileName = localPath.split('/').pop();

    let fullRemotePath = remotePath;
    if (!remotePath.includes('.') && !remotePath.endsWith(localFileName)) {
      fullRemotePath = remotePath.endsWith('/') ? `${remotePath}${localFileName}` : `${remotePath}/${localFileName}`;
    }

    const escapeQuote = (str) => str.replace(/'/g, "'\"'\"'");
    const escapedRemote = escapeQuote(fullRemotePath);

    // Pipe base64-encoded content directly to SSH stdin; remote decodes it.
    // Spawns SSH the same way exec() does, with stdin set to 'pipe' so we can write to it.
    const base64Content = readFileSync(localPath, 'base64');
    const remoteCmd = `base64 -d > '${escapedRemote}'`;
    const sshArgs = [...this.getSSHOptions(), `${this.username}@${this.host}`, remoteCmd];

    await new Promise((resolve, reject) => {
      const proc = spawn('ssh', sshArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error(`File transfer timed out after ${timeout}ms`));
      }, timeout);

      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        if (timedOut) return;
        if (code === 0) resolve();
        else reject(new Error(`File transfer failed: ${stderr || `exit code ${code}`}`));
      });
      proc.on('error', (err) => { clearTimeout(timeoutId); reject(err); });

      proc.stdin.write(base64Content);
      proc.stdin.end();
    });

    // Verify file size
    const remoteSize = await this.exec(`wc -c < '${escapedRemote}' | tr -d ' '`);
    const remoteSizeBytes = parseInt(remoteSize.trim(), 10);

    if (remoteSizeBytes !== localFileSize) {
      throw new Error(
        `File transfer verification failed: local size ${localFileSize} bytes, remote size ${remoteSizeBytes} bytes. ` +
        `File may be truncated on remote.`
      );
    }

    return `File transferred: ${localFileName}`;
  }

  close() {
    // SSH client spawns commands per-invocation with no persistent connection
    // so there's nothing to close. This is a no-op to satisfy the client interface.
  }
}

export default SSHClient;

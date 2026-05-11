import { execCommand } from './command-runner.js';
import { statSync } from 'fs';

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
    // File transfer using SSH piping with size verification
    const localStats = statSync(localPath);
    const localFileSize = localStats.size;
    const localFileName = localPath.split('/').pop();

    let fullRemotePath = remotePath;
    if (!remotePath.includes('.') && !remotePath.endsWith(localFileName)) {
      fullRemotePath = remotePath.endsWith('/') ? `${remotePath}${localFileName}` : `${remotePath}/${localFileName}`;
    }

    const escapeQuote = (str) => str.replace(/'/g, "'\"'\"'");
    const escapedLocal = escapeQuote(localPath);
    const escapedRemote = escapeQuote(fullRemotePath);

    const sshOptions = this.getSSHOptions().join(' ');
    const shellCmd = `cat '${escapedLocal}' | ssh ${sshOptions} ${this.username}@${this.host} 'cat > '\\''${escapedRemote}'\\''  && sync'`;

    const args = ['-c', shellCmd];
    await execCommand('bash', args, { timeout, errorPrefix: 'File transfer failed' });

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

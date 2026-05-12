import { execCommand } from './command-runner.js';
import { statSync, readFileSync } from 'fs';

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

    // Rivanna's zsh login shell consumes SSH stdin as commands before the remote process
    // can read it. Embed base64 content in the command string via printf instead — no stdin needed.
    const base64Content = readFileSync(localPath, 'base64');
    const remoteCmd = `printf '%s' '${base64Content}' | bash -c 'base64 -d > '"'"'${escapedRemote}'"'"''`;
    await this.exec(remoteCmd, timeout);

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

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
    // Use base64 encoding with SSH piping for reliable binary-safe transfer
    // Avoids truncation issues with direct piping and handles all file types
    // Verifies transfer by comparing local and remote file sizes

    // Get local file size for verification
    const localStats = statSync(localPath);
    const localFileSize = localStats.size;

    // Extract filename from local path
    const localFileName = localPath.split('/').pop();

    // If remotePath is a directory (doesn't contain a dot for file extension),
    // append the filename to create the full remote file path
    let fullRemotePath = remotePath;
    if (!remotePath.includes('.') && !remotePath.endsWith(localFileName)) {
      // Treat as directory - append filename
      fullRemotePath = remotePath.endsWith('/') ? `${remotePath}${localFileName}` : `${remotePath}/${localFileName}`;
    }

    const escapeQuote = (str) => str.replace(/'/g, "'\"'\"'");
    const escapedLocal = escapeQuote(localPath);
    const escapedRemote = escapeQuote(fullRemotePath);

    const sshOptions = this.getSSHOptions().join(' ');
    // Use base64 encoding to safely pipe binary data through SSH
    // Decode on remote end and write to file
    const remoteCmd = `base64 -d > '${escapedRemote}'`;
    const shellCmd = `cat '${escapedLocal}' | base64 | ssh ${sshOptions} ${this.username}@${this.host} '${remoteCmd}'`;

    const args = ['-c', shellCmd];
    await execCommand('bash', args, { timeout, errorPrefix: 'File transfer failed' });

    // Verify file transfer by comparing file sizes
    const remoteSize = await this.exec(`wc -c < '${escapedRemote}' | tr -d ' '`);
    const remoteSizeBytes = parseInt(remoteSize.trim(), 10);

    if (remoteSizeBytes !== localFileSize) {
      throw new Error(
        `File transfer verification failed: local size ${localFileSize} bytes, remote size ${remoteSizeBytes} bytes. ` +
        `File may be truncated on remote. Ensure full file transfer before proceeding.`
      );
    }

    return `File transferred successfully: ${localFileName} (${localFileSize} bytes)`;
  }
}

export default SSHClient;

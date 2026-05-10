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

  async transferFile(localPath, remotePath, timeout = 120000) {
    // Use SFTP for reliable file transfer (proper binary-safe protocol)
    // Avoids SSH piping truncation issues by using dedicated file transfer protocol
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

    // Build SFTP command with SSH options
    const sshOpts = this.getSSHOptions().map(opt => `-o${opt}`).join(' ');
    const sftpCmd = `put "${localPath.replace(/"/g, '\\"')}" "${fullRemotePath.replace(/"/g, '\\"')}"`;
    const shellCmd = `echo '${sftpCmd}' | sftp ${sshOpts} ${this.username}@${this.host}`;

    const args = ['-c', shellCmd];
    await execCommand('bash', args, { timeout, errorPrefix: 'File transfer failed' });

    // Verify file transfer by comparing file sizes
    const remoteSize = await this.exec(`wc -c < "${fullRemotePath.replace(/"/g, '\\"')}" | tr -d ' '`);
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

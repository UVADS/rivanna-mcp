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
    // Use SSH piping with checksum verification for reliable transfer
    // Avoids SCP hangs on Rivanna by using direct piping with integrity checks

    // Get local file size and checksum for verification
    const localStats = statSync(localPath);
    const localFileSize = localStats.size;
    const localChecksum = await execCommand('md5sum', [localPath], { timeout: 30000 });
    const localMD5 = localChecksum.split(/\s+/)[0];

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
    // Use cat piping with explicit close to ensure all data is sent
    const remoteCmd = `cat > '${escapedRemote}' && sync`;
    const shellCmd = `cat '${escapedLocal}' | ssh ${sshOptions} ${this.username}@${this.host} '${remoteCmd}'`;

    const args = ['-c', shellCmd];
    await execCommand('bash', args, { timeout, errorPrefix: 'File transfer failed' });

    // Verify transfer with size check (primary) and checksum (secondary)
    const remoteSize = await this.exec(`wc -c < '${escapedRemote}' | tr -d ' '`);
    const remoteSizeBytes = parseInt(remoteSize.trim(), 10);

    if (remoteSizeBytes !== localFileSize) {
      throw new Error(
        `File transfer verification failed: local size ${localFileSize} bytes, remote size ${remoteSizeBytes} bytes. ` +
        `File may be truncated on remote.`
      );
    }

    // Additional checksum verification
    const remoteChecksum = await this.exec(`md5sum '${escapedRemote}' | awk '{print $1}'`);
    const remoteMD5 = remoteChecksum.trim();

    if (remoteMD5 !== localMD5) {
      throw new Error(
        `File integrity verification failed: checksums don't match. ` +
        `Local: ${localMD5}, Remote: ${remoteMD5}. File may be corrupted.`
      );
    }

    return `File transferred successfully: ${localFileName} (${localFileSize} bytes, MD5: ${localMD5})`;
  }
}

export default SSHClient;

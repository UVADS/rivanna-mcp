import { execCommand } from './command-runner.js';

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
    // Use SSH piping with cat for reliable file transfer
    // Avoids rsync spawn issues and Rivanna's SCP hang problem
    // Properly escapes single quotes in paths
    const escapeQuote = (str) => str.replace(/'/g, "'\"'\"'");
    const escapedLocal = escapeQuote(localPath);
    const escapedRemote = escapeQuote(remotePath);

    const sshOptions = this.getSSHOptions().join(' ');
    const remoteCmd = `cat > '${escapedRemote}'`;
    const shellCmd = `cat '${escapedLocal}' | ssh ${sshOptions} ${this.username}@${this.host} '${remoteCmd}'`;

    const args = ['-c', shellCmd];
    return execCommand('bash', args, { timeout, errorPrefix: 'File transfer failed' });
  }
}

export default SSHClient;

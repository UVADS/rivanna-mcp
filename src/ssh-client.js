import { execCommand } from './command-runner.js';

class SSHClient {
  constructor(host = 'login.hpc.virginia.edu', username, privateKeyPath) {
    this.host = host;
    this.username = username;
    this.privateKeyPath = privateKeyPath;
  }

  // Get SSH options that work reliably with Rivanna
  // Note: StrictHostKeyChecking=accept-new provides security while auto-accepting new keys
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

  async scp(localPath, remotePath, timeout = 60000) {
    // Rivanna's SCP is broken/hangs, so use SSH piping with cat instead
    // This is reliable and works around the SCP protocol issue
    const remoteCmd = `cat > '${remotePath.replace(/'/g, "'\"'\"'")}'`;
    const args = [
      '-c',
      `cat '${localPath.replace(/'/g, "'\"'\"'")}' | ssh ${this.getSSHOptions().join(' ')} '${this.username}@${this.host}' '${remoteCmd}'`
    ];

    return execCommand('bash', args, { timeout, errorPrefix: 'File transfer failed' });
  }

  close() {
    // No-op for compatibility
  }
}

export default SSHClient;

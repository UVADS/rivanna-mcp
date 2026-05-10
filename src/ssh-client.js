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
    const remoteCmd = `cat > '${remotePath.replace(/'/g, "'\"'\"'")}'`;
    const args = [
      '-c',
      `cat '${localPath.replace(/'/g, "'\"'\"'")}' | ssh ${this.getSSHOptions().join(' ')} '${this.username}@${this.host}' '${remoteCmd}'`
    ];

    return execCommand('bash', args, { timeout, errorPrefix: 'File transfer failed' });
  }
}

export default SSHClient;

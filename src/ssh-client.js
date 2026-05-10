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
    // Use rsync for robust file transfer instead of cat/pipe
    // rsync handles proper shell escaping, directories, and binary files safely
    const sshOptions = this.getSSHOptions().join(' ');
    const args = [
      '-av',
      `--rsh=ssh ${sshOptions}`,
      localPath,
      `${this.username}@${this.host}:${remotePath}`
    ];

    return execCommand('rsync', args, { timeout, errorPrefix: 'File transfer failed' });
  }
}

export default SSHClient;

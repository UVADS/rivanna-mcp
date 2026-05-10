import { execCommand } from './command-runner.js';

class SSHClient {
  constructor(host, username, privateKeyPath) {
    this.host = host;
    this.username = username;
    this.privateKeyPath = privateKeyPath;
  }

  async exec(command, timeout = 30000) {
    const args = [
      '-i', this.privateKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'BatchMode=yes',
      '-o', 'KexAlgorithms=sntrup761x25519-sha512@openssh.com,curve25519-sha256,diffie-hellman-group14-sha256',
      `${this.username}@${this.host}`,
      command,
    ];

    return execCommand('ssh', args, { timeout, errorPrefix: 'SSH command failed' });
  }

  async scp(localPath, remotePath, timeout = 60000) {
    const args = [
      '-i', this.privateKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'BatchMode=yes',
      '-o', 'KexAlgorithms=sntrup761x25519-sha512@openssh.com,curve25519-sha256,diffie-hellman-group14-sha256',
      localPath,
      `${this.username}@${this.host}:${remotePath}`,
    ];

    return execCommand('scp', args, { timeout, errorPrefix: 'SCP file transfer failed' });
  }

  close() {
    // No persistent connection, nothing to close
  }
}

export default SSHClient;

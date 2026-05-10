import { Client as SSHClient2 } from 'ssh2';
import { promises as fs } from 'fs';
import { execCommand } from './command-runner.js';

class SSHClient {
  constructor(host = 'login.hpc.virginia.edu', username, privateKeyPath) {
    this.host = host;
    this.username = username;
    this.privateKeyPath = privateKeyPath;
    this.sftpClient = null;
    this.sshConn = null;
  }

  // SSH connection options with user-specified security settings
  getSSHOptions() {
    return {
      host: this.host,
      username: this.username,
      privateKey: this.privateKey,
      readyTimeout: 30000,
      // Security options as specified
      strictHostKeyChecking: 'accept-new',
      algorithms: {
        kex: [
          'ecdh-sha2-nistp256',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
        ],
      },
      // Suppress weak crypto warnings
      globalParameter: {
        WarnWeakCrypto: 'no',
      },
    };
  }

  async ensurePrivateKey() {
    if (!this.privateKey) {
      this.privateKey = await fs.readFile(this.privateKeyPath);
    }
  }

  async exec(command, timeout = 30000) {
    const args = [
      '-i', this.privateKeyPath,
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'WarnWeakCrypto=no',
      '-o', 'KexAlgorithms=ecdh-sha2-nistp256,diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha256',
      `${this.username}@${this.host}`,
      command,
    ];

    return execCommand('ssh', args, { timeout, errorPrefix: 'SSH command failed' });
  }

  async sftp(localPath, remotePath, timeout = 60000) {
    try {
      await this.ensurePrivateKey();

      return new Promise((resolve, reject) => {
        const conn = new SSHClient2();
        const options = this.getSSHOptions();

        conn.on('ready', async () => {
          conn.sftp((err, sftp) => {
            if (err) {
              conn.end();
              return reject(new Error(`SFTP subsystem failed: ${err.message}`));
            }

            sftp.fastPut(localPath, remotePath, { concurrent: 32 }, (putErr) => {
              if (putErr) {
                sftp.end();
                conn.end();
                return reject(new Error(`SFTP upload failed: ${putErr.message}`));
              }

              sftp.end();
              conn.end();
              resolve(`File transferred: ${localPath} -> ${this.username}@${this.host}:${remotePath}`);
            });
          });
        });

        conn.on('error', (err) => {
          reject(new Error(`SSH connection failed: ${err.message}`));
        });

        conn.on('keyboard-interactive', (name, instructions, prompts, finish) => {
          finish(['']);
        });

        const timeoutHandle = setTimeout(() => {
          conn.end();
          reject(new Error(`SFTP transfer timeout after ${timeout}ms`));
        }, timeout);

        conn.on('end', () => {
          clearTimeout(timeoutHandle);
        });

        conn.connect(options);
      });
    } catch (error) {
      throw new Error(`SFTP file transfer failed: ${error.message}`);
    }
  }

  // Backward compatibility: keep scp method but use sftp internally
  async scp(localPath, remotePath, timeout = 60000) {
    return this.sftp(localPath, remotePath, timeout);
  }

  close() {
    if (this.sshConn) {
      this.sshConn.end();
      this.sshConn = null;
    }
    if (this.sftpClient) {
      this.sftpClient.end();
      this.sftpClient = null;
    }
  }
}

export default SSHClient;

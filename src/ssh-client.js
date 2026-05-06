import { Client } from 'ssh2';
import { readFileSync } from 'fs';

class SSHClient {
  constructor(host, username, privateKeyPath) {
    this.host = host;
    this.username = username;
    this.privateKeyPath = privateKeyPath;
    this.conn = null;
  }

  async connect() {
    if (this.conn) return;

    return new Promise((resolve, reject) => {
      const client = new Client();
      const privateKey = readFileSync(this.privateKeyPath);

      client.on('ready', () => {
        this.conn = client;
        resolve();
      });

      client.on('error', reject);
      client.on('close', () => {
        this.conn = null;
      });

      client.connect({
        host: this.host,
        username: this.username,
        privateKey,
        readyTimeout: 30000,
      });
    });
  }

  async exec(command, timeout = 30000) {
    if (!this.conn) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      this.conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code, signal) => {
          clearTimeout(timeoutId);
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Command exited with code ${code}: ${stderr}`));
          }
        });

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  close() {
    if (this.conn) {
      this.conn.end();
      this.conn = null;
    }
  }
}

export default SSHClient;

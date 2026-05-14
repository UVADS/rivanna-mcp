import { readFileSync, statSync } from 'fs';
import { Client } from 'ssh2';

// Algorithm list broad enough to cover Rivanna's OpenSSH 8.0 server
const ALGORITHMS = {
  kex: [
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group16-sha512',
    'diffie-hellman-group18-sha512',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1',
  ],
  cipher: [
    'aes128-gcm@openssh.com',
    'aes256-gcm@openssh.com',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-cbc',
    'aes256-cbc',
  ],
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
  ],
  hmac: [
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1',
  ],
};

class SSHClient {
  constructor(host = 'login.hpc.virginia.edu', username, privateKeyPath) {
    this.host = host;
    this.username = username;
    this.privateKeyPath = privateKeyPath;
    this._conn = null;
    this._connected = false;
  }

  // Establish the SSH connection (idempotent — reuses an open connection)
  _connect() {
    if (this._connected && this._conn) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        this._conn = conn;
        this._connected = true;
        resolve();
      });

      conn.on('error', (err) => {
        this._connected = false;
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      conn.on('close', () => {
        this._connected = false;
        this._conn = null;
      });

      conn.connect({
        host: this.host,
        port: 22,
        username: this.username,
        privateKey: readFileSync(this.privateKeyPath),
        readyTimeout: 15000,
        algorithms: ALGORITHMS,
      });
    });
  }

  async exec(command, timeout = 30000) {
    await this._connect();

    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, val) => { if (!settled) { settled = true; fn(val); } };

      const timer = setTimeout(() => {
        done(reject, new Error(`SSH command timed out after ${timeout}ms: ${command.slice(0, 80)}`));
      }, timeout);

      this._conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return done(reject, new Error(`SSH exec failed: ${err.message}`));
        }

        let stdout = '', stderr = '';
        stream.on('data', (d) => { stdout += d.toString(); });
        stream.stderr.on('data', (d) => { stderr += d.toString(); });
        stream.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) {
            done(reject, new Error(`SSH command exited ${code}: ${stderr.trim() || stdout.trim()}`));
          } else {
            done(resolve, stdout);
          }
        });

        // Close stdin so the remote zsh login shell doesn't block waiting for input
        stream.stdin.end();
      });
    });
  }

  // Returns the shell that should be used for login-shell commands (e.g. `module`).
  // Probes bash first; if .bash_profile does `exec zsh` (common on Rivanna), bash
  // swallows all output — in that case we fall back to zsh.
  async getLoginShell() {
    if (this._loginShell) return this._loginShell;
    try {
      const out = await this.exec('/bin/bash -l -c "echo __probe__"');
      this._loginShell = out.includes('__probe__') ? '/bin/bash' : '/bin/zsh';
    } catch {
      this._loginShell = '/bin/zsh';
    }
    return this._loginShell;
  }

  async transferFile(localPath, remotePath, timeout = 60000) {
    const localSize = statSync(localPath).size;
    const localFileName = localPath.split('/').pop();

    let fullRemotePath = remotePath;
    if (!remotePath.includes('.') && !remotePath.endsWith(localFileName)) {
      fullRemotePath = remotePath.endsWith('/') ? `${remotePath}${localFileName}` : `${remotePath}/${localFileName}`;
    }

    const escapeQuote = (str) => str.replace(/'/g, "'\"'\"'");
    const escapedRemote = escapeQuote(fullRemotePath);

    // Rivanna's zsh login shell consumes SSH stdin before the remote process can read it.
    // Embed base64 content in the command string via printf — no stdin needed.
    const b64 = readFileSync(localPath).toString('base64');
    const remoteCmd = `printf '%s' '${b64}' | base64 -d > '${escapedRemote}'`;
    await this.exec(remoteCmd, timeout);

    const sizeOut = await this.exec(`wc -c < '${escapedRemote}' | tr -d ' '`);
    const remoteSize = parseInt(sizeOut.trim(), 10);

    if (remoteSize !== localSize) {
      throw new Error(
        `File transfer verification failed: local ${localSize} bytes, remote ${remoteSize} bytes`
      );
    }

    return `File transferred: ${localFileName}`;
  }

  close() {
    if (this._conn) {
      try { this._conn.end(); } catch {}
      this._conn = null;
      this._connected = false;
    }
  }
}

export default SSHClient;

import SSHClient from './ssh-client.js';
import LocalClient from './local-client.js';

/**
 * Creates a client for command execution and file transfer.
 *
 * Client Interface Contract:
 *   async exec(command: string, timeout?: number): Promise<string>
 *     Execute a shell command and return stdout
 *
 *   close(): void
 *     Clean up client resources. Must be idempotent and safe to call when
 *     never connected. No-op for local/SSH clients.
 *
 *   async transferFile?(localPath: string, remotePath: string, timeout?: number): Promise<string>
 *     (Optional) Transfer a file to remote location and verify size
 *
 * @param {object} config - Server configuration
 * @param {boolean} config.userIsRemote - Use remote SSH client
 * @param {string} config.hpcHost - Remote hostname (for remote mode)
 * @param {string} config.computingId - Remote username (for remote mode)
 * @param {string} config.sshKeyPath - SSH private key path (for remote mode)
 * @returns {SSHClient|LocalClient}
 */
export function createClient(config) {
  if (config.userIsRemote) {
    return new SSHClient(config.hpcHost, config.computingId, config.sshKeyPath);
  }

  return new LocalClient();
}

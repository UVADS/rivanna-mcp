import SSHClient from './ssh-client.js';
import LocalClient from './local-client.js';

export function createClient(config) {
  if (config.userIsRemote) {
    return new SSHClient(config.hpcHost, config.computingId, config.sshKeyPath);
  }

  return new LocalClient();
}

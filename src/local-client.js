import { execCommand } from './command-runner.js';

class LocalClient {
  async exec(command, timeout = 30000) {
    return execCommand('/bin/bash', ['-c', command], { timeout });
  }

  close() {
    // No persistent connection, nothing to close
  }
}

export default LocalClient;

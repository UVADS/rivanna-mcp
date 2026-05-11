import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_FILE = join(homedir(), '.rivanna-mcp', 'config.json');

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    console.error(`\nConfiguration not found: ${CONFIG_FILE}`);
    console.error(`\nSetup required. Run:`);
    console.error(`  rivanna-mcp setup\n`);
    process.exit(2);
  }

  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    validateConfig(config);

    // Enable verbose mode from environment variable (useful for debugging)
    if (process.env.RIVANNA_VERBOSE === 'true' || process.env.RIVANNA_VERBOSE === '1') {
      config.verbose = true;
    }

    return config;
  } catch (error) {
    console.error(`\nConfiguration error: ${error.message}`);
    console.error(`\nTo fix, run:`);
    console.error(`  rivanna-mcp setup\n`);
    process.exit(2);
  }
}

function validateConfig(config) {
  const requiredFields = ['userIsRemote'];
  const remoteRequiredFields = ['hpcHost', 'computingId', 'sshKeyPath'];

  for (const field of requiredFields) {
    if (!(field in config)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (typeof config.userIsRemote !== 'boolean') {
    throw new Error(`Invalid configuration: userIsRemote must be boolean, got ${typeof config.userIsRemote}`);
  }

  if (config.userIsRemote) {
    for (const field of remoteRequiredFields) {
      if (!(field in config)) {
        throw new Error(`Missing required field for remote mode: ${field}`);
      }
      if (typeof config[field] !== 'string' || !config[field].trim()) {
        throw new Error(`Invalid ${field}: must be a non-empty string`);
      }
    }

    if (!existsSync(config.sshKeyPath)) {
      throw new Error(
        `SSH key not found: ${config.sshKeyPath}\n` +
        `Generate with: ssh-keygen -t ed25519 -f ${config.sshKeyPath}\n` +
        `Then update config at: ${CONFIG_FILE}`
      );
    }
  }
}

export function getConfigPath() {
  return CONFIG_FILE;
}

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_FILE = join(homedir(), '.rivanna-mcp', 'config.json');

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    console.error(
      `\n❌ Configuration not found at: ${CONFIG_FILE}`
    );
    console.error(
      '\n📝 Please run: rivanna-mcp setup'
    );
    console.error(
      '\nThis will guide you through configuring your Rivanna connection.\n'
    );
    process.exit(1);
  }

  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    validateConfig(config);
    return config;
  } catch (error) {
    console.error(`\n❌ Error reading configuration: ${error.message}`);
    process.exit(1);
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
      throw new Error(`SSH key not found at: ${config.sshKeyPath}`);
    }
  }
}

export function getConfigPath() {
  return CONFIG_FILE;
}

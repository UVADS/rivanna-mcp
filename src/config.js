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
    return config;
  } catch (error) {
    console.error(`\n❌ Error reading configuration: ${error.message}`);
    process.exit(1);
  }
}

export function getConfigPath() {
  return CONFIG_FILE;
}

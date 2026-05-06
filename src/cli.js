#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const command = process.argv[2];

if (command === 'setup') {
  const setup = await import('./setup.js');
  await setup.runSetup();
} else if (command === undefined) {
  // Run the MCP server
  const server = await import('./index.js');
} else {
  console.error(`Unknown command: ${command}`);
  console.error(`\nUsage: rivanna-mcp setup`);
  process.exit(1);
}

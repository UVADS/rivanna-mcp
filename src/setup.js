import inquirer from 'inquirer';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { resolve } from 'path';
import SSHClient from './ssh-client.js';

const CONFIG_DIR = join(homedir(), '.rivanna-mcp');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function expandPath(filePath) {
  if (filePath.startsWith('~')) {
    return join(homedir(), filePath.slice(1));
  }
  return resolve(filePath);
}

function validateSSHKey(keyPath) {
  const expandedPath = expandPath(keyPath);

  if (!existsSync(expandedPath)) {
    return `SSH key not found at: ${expandedPath}`;
  }

  try {
    const stat = statSync(expandedPath);
    if (!stat.isFile()) {
      return `Path is not a file: ${expandedPath}`;
    }
  } catch (error) {
    return `Cannot read SSH key: ${error.message}`;
  }

  return true;
}

async function testSSHConnection(hpcHost, computingId, sshKeyPath) {
  const sshClient = new SSHClient(hpcHost, computingId, sshKeyPath);

  try {
    console.log('\n⏳ Testing SSH connection...');
    const output = await sshClient.exec('whoami');

    return {
      success: true,
      username: output.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function runSetup() {
  console.log('\n🔧 Rivanna MCP Setup\n');
  console.log(
    'This will configure your connection to the Rivanna HPC cluster.\n'
  );

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'computingId',
      message: 'UVA computing ID (Rivanna username)',
      default: process.env.USER,
      validate: (input) => {
        if (!input.trim()) {
          return 'Computing ID cannot be empty';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'sshKeyPath',
      message: 'Path to SSH private key',
      default: join(homedir(), '.ssh/id_rsa'),
      validate: validateSSHKey,
    },
  ]);

  // Test the SSH connection
  const HPC_HOST = 'login.hpc.virginia.edu';
  const testResult = await testSSHConnection(
    HPC_HOST,
    answers.computingId,
    answers.sshKeyPath
  );

  if (!testResult.success) {
    console.log(`\n❌ Connection failed: ${testResult.error}`);
    console.log(
      '\n📝 To use this MCP tool you must either be connected to the campus network or use a remote VPN.'
    );
    console.log(
      '\n💡 Troubleshooting:'
    );
    console.log(
      '   • Verify your Computing ID is correct'
    );
    console.log(
      '   • Check that your SSH key exists and has proper permissions'
    );
    console.log(
      '   • Ensure you are on the campus network or connected to VPN'
    );
    console.log(
      '   • Try connecting manually: ssh -i ' + answers.sshKeyPath + ' ' + answers.computingId + '@' + HPC_HOST + '\n'
    );
    process.exit(1);
  }

  const config = {
    computingId: answers.computingId,
    sshKeyPath: expandPath(answers.sshKeyPath),
    hpcHost: HPC_HOST,
    createdAt: new Date().toISOString(),
  };

  // Create config directory if it doesn't exist
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Write config file
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  console.log(`\n✅ Configuration saved to: ${CONFIG_FILE}`);
  console.log(`\n📋 Configuration:`);
  console.log(`   Computing ID: ${config.computingId}`);
  console.log(`   SSH Key: ${config.sshKeyPath}`);
  console.log(`   HPC Host: ${config.hpcHost}`);
  console.log(`\n🔐 SSH Connection: Connected as ${testResult.username}`);
  console.log(
    `\n🚀 You can now use the MCP server. It will be available for Claude Code integration.\n`
  );

  process.exit(0);
}

import inquirer from 'inquirer';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { resolve } from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import SSHClient from './ssh-client.js';
import { getAllocationInfo } from './tools/allocation-billing.js';

const exec = promisify(execCallback);

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
      sshClient,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function queryAllocations(userIsRemote, sshClient, computingId) {
  try {
    console.log('\n⏳ Fetching your allocations...');
    const allocInfo = await getAllocationInfo(sshClient, { user: computingId });

    if (!allocInfo.success || !allocInfo.allocations || allocInfo.allocations.length === 0) {
      return {
        success: false,
        error: 'No allocations found',
      };
    }

    return {
      success: true,
      allocations: allocInfo.allocations,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function selectDefaultAllocation(allocations) {
  const choices = allocations.map((alloc) => {
    let label = `${alloc.account}`;
    if (alloc.suAvailable) {
      label += ` (${parseFloat(alloc.suAvailable).toFixed(0)} SU)`;
    }
    return {
      name: label,
      value: alloc.account,
    };
  });

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'defaultAllocation',
      message: 'Select your default allocation (used when creating jobs)',
      choices,
    },
  ]);

  return answer.defaultAllocation;
}

export async function runSetup() {
  console.log('\n🔧 Rivanna MCP Setup\n');
  console.log(
    'This will configure your connection to the Rivanna HPC cluster.\n'
  );

  // First question: local or remote mode
  const modeAnswers = await inquirer.prompt([
    {
      type: 'list',
      name: 'userIsRemote',
      message: 'How will you use this MCP?',
      choices: [
        {
          name: 'Remote: Running Claude Code on my local workstation',
          value: true,
        },
        {
          name: 'Local: Already logged into a Rivanna compute node',
          value: false,
        },
      ],
    },
  ]);

  const userIsRemote = modeAnswers.userIsRemote;

  // Build dynamic questions based on mode
  const dynamicQuestions = [
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
  ];

  // Only ask for SSH key if remote
  if (userIsRemote) {
    dynamicQuestions.push({
      type: 'input',
      name: 'sshKeyPath',
      message: 'Path to SSH private key',
      default: join(homedir(), '.ssh/id_rsa'),
      validate: validateSSHKey,
    });
  }

  dynamicQuestions.push({
    type: 'confirm',
    name: 'logging',
    message: 'Enable logging of MCP interactions to ~/.rivanna-mcp/history.log?',
    default: true,
  });

  const answers = await inquirer.prompt(dynamicQuestions);

  // Test connection if remote
  let testResult = null;
  let sshClient = null;
  if (userIsRemote) {
    const HPC_HOST = 'login.hpc.virginia.edu';
    testResult = await testSSHConnection(
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
        '   • Try connecting manually: ssh -i ' + answers.sshKeyPath + ' ' + answers.computingId + '@login.hpc.virginia.edu\n'
      );
      process.exit(1);
    }
    sshClient = testResult.sshClient;
  }

  // Query allocations
  let allocResult = null;
  let defaultAllocation = null;
  if (sshClient || !userIsRemote) {
    allocResult = await queryAllocations(userIsRemote, sshClient, answers.computingId);

    if (allocResult.success && allocResult.allocations.length > 0) {
      defaultAllocation = await selectDefaultAllocation(allocResult.allocations);
    } else {
      console.log('\n⚠️  Could not fetch allocations: ' + (allocResult.error || 'Unknown error'));
      console.log('You can set a default allocation later by editing ~/.rivanna-mcp/config.json\n');
    }
  }

  const HPC_HOST = 'login.hpc.virginia.edu';
  const config = {
    computingId: answers.computingId,
    userIsRemote,
    hpcHost: HPC_HOST,
    logging: answers.logging,
    createdAt: new Date().toISOString(),
  };

  // Only include SSH key if remote
  if (userIsRemote) {
    config.sshKeyPath = expandPath(answers.sshKeyPath);
  }

  // Include default allocation if one was selected
  if (defaultAllocation) {
    config.defaultAllocation = defaultAllocation;
  }

  // Create config directory if it doesn't exist
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Write config file
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  console.log(`\n✅ Configuration saved to: ${CONFIG_FILE}`);
  console.log(`\n📋 Configuration:`);
  console.log(`   Mode: ${userIsRemote ? 'Remote (via SSH)' : 'Local (direct execution)'}`);
  console.log(`   Computing ID: ${config.computingId}`);
  if (userIsRemote) {
    console.log(`   SSH Key: ${config.sshKeyPath}`);
  }
  console.log(`   HPC Host: ${config.hpcHost}`);
  console.log(`   Logging: ${config.logging ? 'Enabled (' + join(CONFIG_DIR, 'history.log') + ')' : 'Disabled'}`);
  if (defaultAllocation) {
    console.log(`   Default Allocation: ${defaultAllocation}`);
  }
  if (testResult) {
    console.log(`\n🔐 SSH Connection: Connected as ${testResult.username}`);
  } else {
    console.log(`\n✅ Local mode configured`);
  }
  console.log(
    `\n🚀 You can now use the MCP server. It will be available for Claude Code integration.\n`
  );

  process.exit(0);
}

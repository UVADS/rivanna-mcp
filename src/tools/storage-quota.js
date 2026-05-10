import { shellQuote } from '../utils.js';

export async function getStorageQuota(sshClient) {
  // Get current username
  const usernameOutput = await sshClient.exec('whoami');
  const username = usernameOutput.trim();

  // Get quota info from hdquota -s
  let hdquotaOutput;
  try {
    hdquotaOutput = await sshClient.exec('hdquota -s 2>/dev/null');
  } catch (e) {
    return {
      success: false,
      username,
      error: 'Could not retrieve storage quota information',
      quotas: [],
    };
  }

  // Parse hdquota output and map to storage types
  const quotas = parseHdquotaOutput(hdquotaOutput, username);

  return {
    success: true,
    username,
    quotas,
  };
}

function parseHdquotaOutput(output, username) {
  const lines = output.trim().split('\n').filter(line => line.trim());
  const quotas = [];

  // Expected hdquota -s format (varies, but typically):
  // Filesystem    Size    Used    Avail   Use%
  // OR
  // name    quota   used    available   percent

  for (const line of lines) {
    if (!line || line.match(/^\s*(Filesystem|Name|---)/i)) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const filesystem = parts[0];
    let quota, used, available, percentStr;

    // Try to identify which columns are which
    // Look for percentage at the end (ends with %)
    const percentIdx = parts.findIndex(p => p.includes('%'));
    if (percentIdx > 0) {
      percentStr = parts[percentIdx];
      used = parts[percentIdx - 2];
      quota = parts[percentIdx - 3];
      available = parts[percentIdx - 1];
    } else {
      quota = parts[1];
      used = parts[2];
      available = parts[3];
      percentStr = parts[4];
    }

    // Determine storage type based on path
    let type = 'other';
    let name = `${filesystem} Storage`;
    let path = filesystem;

    if (filesystem.includes('home')) {
      type = 'home';
      name = 'Home Storage (GPFS)';
      path = `/home/${username}`;
    } else if (filesystem.includes('scratch') || filesystem.includes('weka')) {
      type = 'scratch';
      name = 'Scratch Storage (Weka)';
      path = `/sfs/weka/scratch/${username}`;
    }

    quotas.push({
      name,
      path,
      type,
      filesystem,
      quota: quota || 'N/A',
      usage: used || 'N/A',
      available: available || 'N/A',
      percentUsed: percentStr || 'N/A',
    });
  }

  return quotas;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIdx = 0;

  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }

  return `${size.toFixed(1)}${units[unitIdx]}`;
}

export async function getDirectoryUsage(sshClient, path = '.') {
  const command = `du -sh ${shellQuote(path)}`;
  const output = await sshClient.exec(command);
  const [size] = output.trim().split('\t');

  return {
    success: true,
    path,
    usage: size,
  };
}

export const storageQuotaTool = {
  name: 'get_storage_quota',
  description: 'Get storage quota information for all mounted filesystems.',
  inputSchema: {
    type: 'object',
    properties: {
      filesystem: {
        type: 'string',
        description: 'Filter by filesystem path (optional)',
      },
    },
  },
};

export const directoryUsageTool = {
  name: 'get_directory_usage',
  description: 'Get disk usage for a specific directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to check (default: current directory)',
        default: '.',
      },
    },
  },
};

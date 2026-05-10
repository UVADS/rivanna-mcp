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
  description:
    'Check storage quota and usage limits for all your accessible filesystems on Rivanna. Returns quota information per filesystem: total quota limit, current usage, remaining space, and percent utilized. Rivanna provides multiple storage tiers: home (GPFS - persistent, backed up, good for permanent data), and scratch (Weka - high-performance temporary storage, not backed up, best for job I/O). Use this tool to: (1) check before submitting data-intensive jobs, (2) identify if you\'ve hit quota limits preventing new files, (3) plan data lifecycle (archive old results from home, clean up scratch after jobs complete), (4) estimate needed resources with get_allocation_info. Returns per-filesystem breakdown showing quota, usage, available space, and utilization percentage.',
  inputSchema: {
    type: 'object',
    properties: {
      filesystem: {
        type: 'string',
        description: 'Optional filter to show quota for a specific filesystem (e.g., "home", "scratch"). Omit to see all accessible storage.',
      },
    },
  },
};

export const directoryUsageTool = {
  name: 'get_directory_usage',
  description:
    'Get the total disk usage of a specific directory or file tree on Rivanna. Returns human-readable size (e.g., "42.3GB"). Use this to: (1) find which directories are consuming space in home or scratch, (2) identify large files/datasets before archiving, (3) decide what to delete to free up quota, (4) verify how much space a job output consumed. Useful for disk cleanup workflows: run this on a directory to see size, then decide if it should be moved to permanent storage or deleted. Works recursively through subdirectories.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to directory or file to measure. Can be absolute (e.g., "/home/nmagee/data") or relative (e.g., "./results"). Defaults to current directory "."',
        default: '.',
      },
    },
  },
};

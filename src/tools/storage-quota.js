export async function getStorageQuota(sshClient, options = {}) {
  // Get current username
  const usernameOutput = await sshClient.exec('whoami');
  const username = usernameOutput.trim();

  // User quotas
  const userQuotas = {
    home: { quota: 200 * 1024 * 1024 * 1024, name: 'Home Storage (GPFS)', path: `/home/${username}` }, // 200GB
    scratch: { quota: 10 * 1024 * 1024 * 1024 * 1024, name: 'Scratch Storage (Weka)', path: `/sfs/weka/scratch/${username}` }, // 10TB
  };

  // Get usage for each location
  const quotas = [];
  for (const [type, config] of Object.entries(userQuotas)) {
    try {
      // Get disk usage in bytes
      const duOutput = await sshClient.exec(`du -sb "${config.path}" 2>/dev/null | awk '{print $1}'`);
      const usageBytes = parseInt(duOutput.trim(), 10);

      if (isNaN(usageBytes)) {
        quotas.push({
          name: config.name,
          path: config.path,
          type,
          usage: 'N/A',
          quota: 'N/A',
          percentUsed: 'N/A',
          error: 'Could not read usage',
        });
        continue;
      }

      // Convert bytes to human readable
      const usageStr = formatBytes(usageBytes);
      const quotaStr = formatBytes(config.quota);
      const percentUsed = ((usageBytes / config.quota) * 100).toFixed(1);

      quotas.push({
        name: config.name,
        path: config.path,
        type,
        usage: usageStr,
        quota: quotaStr,
        percentUsed: `${percentUsed}%`,
      });
    } catch (e) {
      quotas.push({
        name: config.name,
        path: config.path,
        type,
        usage: 'N/A',
        quota: 'N/A',
        percentUsed: 'N/A',
        error: 'Could not access storage',
      });
    }
  }

  return {
    success: true,
    username,
    quotas,
  };
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
  const command = `du -sh "${path}"`;
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

export async function getStorageQuota(sshClient, options = {}) {
  // Get current username
  const usernameOutput = await sshClient.exec('whoami');
  const username = usernameOutput.trim();

  // Check user storage locations
  const storageLocations = [
    {
      name: 'Home Storage (GPFS)',
      path: `/home/${username}`,
      type: 'home',
    },
    {
      name: 'Scratch Storage (Weka)',
      path: `/sfs/weka/scratch/${username}`,
      type: 'scratch',
    },
  ];

  // Get usage for each location
  const quotas = [];
  for (const loc of storageLocations) {
    try {
      // Use du to get total usage, -s for summary, -h for human readable
      const usage = await sshClient.exec(`du -sh "${loc.path}" 2>/dev/null || echo "N/A"`);
      const usageStr = usage.trim().split('\t')[0];

      // Get available space on the filesystem
      const dfOutput = await sshClient.exec(`df -h "${loc.path}" 2>/dev/null | tail -1`);
      const dfParts = dfOutput.trim().split(/\s+/);

      quotas.push({
        name: loc.name,
        path: loc.path,
        type: loc.type,
        usage: usageStr,
        total: dfParts[1] || 'N/A',
        available: dfParts[3] || 'N/A',
        percentUsed: dfParts[4] || '0%',
      });
    } catch (e) {
      quotas.push({
        name: loc.name,
        path: loc.path,
        type: loc.type,
        usage: 'N/A',
        total: 'N/A',
        available: 'N/A',
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

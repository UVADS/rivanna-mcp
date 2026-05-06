export async function getStorageQuota(sshClient, options = {}) {
  const { filesystem } = options;

  let command = 'quota -s';

  const output = await sshClient.exec(command);
  const lines = output.trim().split('\n');

  const quotas = [];
  let currentSection = null;

  for (const line of lines) {
    if (line.startsWith('Disk quotas')) {
      currentSection = line.split(' ')[3];
    } else if (
      line.startsWith('/') ||
      line.match(/^\s+\//)
    ) {
      const parts = line.split(/\s+/).filter((p) => p.length > 0);
      if (parts.length >= 5) {
        quotas.push({
          filesystem: parts[0],
          used: parts[1],
          quota: parts[2],
          limit: parts[3],
          files: parts[4],
          inodeQuota: parts[5],
          type: currentSection,
        });
      }
    }
  }

  if (filesystem) {
    return {
      success: true,
      quotas: quotas.filter((q) => q.filesystem.includes(filesystem)),
    };
  }

  return {
    success: true,
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

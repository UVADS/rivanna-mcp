export async function getStorageQuota(sshClient, options = {}) {
  const { filesystem } = options;

  // Use df for filesystem usage (quota command not available on Rivanna)
  const output = await sshClient.exec('df -h');
  const lines = output.trim().split('\n');

  // Skip header line
  const filesystems = lines.slice(1).map(line => {
    const parts = line.split(/\s+/);
    return {
      filesystem: parts[0],
      size: parts[1],
      used: parts[2],
      available: parts[3],
      percent: parts[4],
      mount: parts[5],
    };
  }).filter(fs => fs.filesystem && fs.filesystem !== 'Filesystem');

  // Filter main storage areas
  const storageFs = filesystems.filter(fs =>
    !fs.filesystem.startsWith('tmp') &&
    !fs.filesystem.includes('/run') &&
    !fs.filesystem.includes('loop') &&
    fs.mount && (fs.mount.startsWith('/') || fs.mount.includes('sfs'))
  );

  let result = storageFs;
  if (filesystem) {
    result = storageFs.filter((q) => q.filesystem.includes(filesystem) || q.mount.includes(filesystem));
  }

  return {
    success: true,
    filesystems: result,
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

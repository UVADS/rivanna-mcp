import { shellQuote } from '../utils.js';
import { getToolDef } from './loader.js';

// Default Rivanna quotas, used to compute percentUsed regardless of what
// hdquota reports as the quota/limit column.
const HOME_QUOTA_BYTES = 200 * 1024 ** 3; // 200GB
const SCRATCH_QUOTA_BYTES = 10 * 1024 ** 4; // 10TB

function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return null;
  const match = sizeStr.trim().match(/^([\d.]+)\s*([KMGTP]?)B?$/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };

  return value * (multipliers[unit] ?? 1);
}

export async function getStorageQuota(sshClient, config = {}) {
  const username = config.computingId || (await sshClient.exec('whoami')).trim();

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

    let displayQuota = quota || 'N/A';
    let displayPercent = percentStr || 'N/A';

    const baselineBytes = type === 'home' ? HOME_QUOTA_BYTES : type === 'scratch' ? SCRATCH_QUOTA_BYTES : null;
    if (baselineBytes) {
      const usedBytes = parseSizeToBytes(used);
      displayQuota = type === 'home' ? '200GB' : '10TB';
      if (usedBytes !== null) {
        displayPercent = `${((usedBytes / baselineBytes) * 100).toFixed(1)}%`;
      }
    }

    quotas.push({
      name,
      path,
      type,
      filesystem,
      quota: displayQuota,
      usage: used || 'N/A',
      available: available || 'N/A',
      percentUsed: displayPercent,
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

export const storageQuotaTool = getToolDef('get_storage_quota');
export const directoryUsageTool = getToolDef('get_directory_usage');

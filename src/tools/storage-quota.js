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

  // hdquota -s columns are separated by 2+ spaces, e.g.:
  // Storage Type       Location            Size       Used      Avail  Use%
  // Home Directory     /home/nem2p       200.0 GB    28.9 GB   171.1 GB   14%
  // Splitting on runs of 2+ spaces keeps "200.0 GB" intact as one field and
  // keeps "Home Directory" / "/home/nem2p" from bleeding into the numeric columns.

  for (const line of lines) {
    const fields = line.trim().split(/\s{2,}/).map(f => f.trim()).filter(Boolean);
    if (fields.length < 5) continue;

    const percentStr = fields[fields.length - 1];
    const available = fields[fields.length - 2];
    const used = fields[fields.length - 3];
    const quota = fields[fields.length - 4];

    // Header and separator rows don't have a real "Use%" value in that slot; skip them.
    if (!/^\d+(\.\d+)?%$/.test(percentStr)) continue;

    const labelFields = fields.slice(0, fields.length - 4);
    const label = labelFields[0] || 'Unknown';
    const reportedPath = labelFields.slice(1).join(' ') || null;
    const lowerLabel = label.toLowerCase();

    let type = 'other';
    let name = `${label} Storage`;
    let path = reportedPath || label;

    if (lowerLabel.includes('home')) {
      type = 'home';
      name = 'Home Storage (GPFS)';
      path = reportedPath || `/home/${username}`;
    } else if (lowerLabel.includes('scratch') || lowerLabel.includes('weka')) {
      type = 'scratch';
      name = 'Scratch Storage (Weka)';
      path = reportedPath || `/sfs/weka/scratch/${username}`;
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
      filesystem: label,
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

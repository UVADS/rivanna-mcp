import { parseLineDelimited, shellQuote } from '../utils.js';

export async function getAllocationInfo(sshClient, options = {}, config = {}) {
  const { user = config.computingId } = options;

  let command = `sacctmgr show assoc format=cluster,account,user,maxcpus,maxnode,maxwall,grpcpumins -p`;

  if (user) {
    command = `sacctmgr show assoc user=${shellQuote(user)} format=cluster,account,user,maxcpus,maxnode,maxwall,grpcpumins -p`;
  }

  const output = await sshClient.exec(command);
  const lines = parseLineDelimited(output).filter((line) => !line.startsWith('Cluster'));

  const allocations = lines.map((line) => {
    const parts = line.split('|').filter((p) => p);
    return {
      cluster: parts[0],
      account: parts[1],
      user: parts[2],
      maxcpus: parts[3],
      maxnode: parts[4],
      maxwall: parts[5],
      grpcpumins: parts[6],
    };
  });

  // Get SU balances from mam-balance
  let suBalances = [];
  try {
    const mamBalanceOutput = await sshClient.exec('/opt/mam/9.1.2/bin/mam-balance');
    suBalances = parseMamBalanceOutput(mamBalanceOutput);
  } catch (error) {
    // mam-balance may not be available, continue without SU info
  }

  // Merge SU information into allocations
  const allocationsWithSU = allocations.map((alloc) => {
    const suInfo = suBalances.find((su) => su.name === alloc.account);
    const result = {
      ...alloc,
    };
    if (suInfo) {
      result.suBalance = suInfo.balance;
      result.suAvailable = suInfo.available;
      result.suReserved = suInfo.reserved;
    }
    return result;
  });

  return {
    success: true,
    allocations: allocationsWithSU,
  };
}

function parseMamBalanceOutput(output) {
  if (!output || output.trim().length === 0) return [];

  const lines = parseLineDelimited(output);
  if (lines.length < 2) return [];

  // Parse header to identify column positions
  const headerLine = lines[0];
  const headers = headerLine.split(/\s+/).map((h) => h.toLowerCase());
  const accounts = [];

  // Parse data rows, skipping separator lines
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);

    // Skip separator lines (e.g., "---- --------")
    if (parts[0].startsWith('-') || !parts[1] || parts[1].startsWith('-')) {
      continue;
    }

    const account = {};

    headers.forEach((header, idx) => {
      account[header] = parts[idx] || '';
    });

    if (account.name && !account.name.startsWith('-')) {
      accounts.push({
        id: account.id,
        name: account.name,
        balance: account.balance,
        reserved: account.reserved,
        effective: account.effective,
        creditlimit: account.creditlimit,
        available: account.available,
      });
    }
  }

  return accounts;
}

export async function getJobHistory(sshClient, options = {}, config = {}) {
  const { user = config.computingId, days = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split('T')[0];

  let command = `sacct --format=jobid,jobname,user,account,state,start,elapsed,cputimeraw,maxvmsize --noheader --start=${dateStr}`;

  if (user) {
    command += ` --user=${shellQuote(user)}`;
  }

  const output = await sshClient.exec(command);
  const lines = parseLineDelimited(output);

  const jobs = lines.map((line) => {
    const parts = line.split(/\s+/);
    const rawDatetime = parts[5] || '';
    const datetime = (rawDatetime === 'Unknown' || rawDatetime === 'None') ? '' : rawDatetime;
    const cpuSeconds = parseInt(parts[7], 10);
    const cpuHours = (cpuSeconds / 3600).toFixed(2);

    return {
      jobid: parts[0],
      jobname: parts[1],
      user: parts[2],
      account: parts[3],
      state: parts[4],
      datetime,
      elapsed: parts[6],
      cpuHours,
      maxMemory: parts[8],
    };
  });

  const totalCpuHours = jobs.reduce(
    (sum, job) => sum + parseFloat(job.cpuHours),
    0
  );

  return {
    success: true,
    days,
    jobCount: jobs.length,
    totalCpuHours: totalCpuHours.toFixed(2),
    jobs,
  };
}

export const allocationInfoTool = {
  name: 'get_allocation_info',
  description:
    'Get your account/allocation details including resource limits and SU (Service Unit) balance information. Returns: cluster name, assigned account(s), user association, max CPUs per job, max nodes per job, max wall-clock time allowed, and group CPU-minutes allocation. Also includes SU balance (how many compute credits remain), reserved SU (amount held for pending jobs), and effective balance. Use this to: (1) verify you have an active allocation before submitting jobs, (2) check if you have sufficient SU balance for planned jobs, (3) understand resource limits (CPU/node/time caps), (4) identify which account to use if you have multiple allocations, (5) track when allocations will expire. Essential for job planning: if SU balance is low or CPU limits are tight, jobs may not schedule even if cluster has free resources.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Filter to show allocation info for a specific username (optional). Omit to show your own allocations.',
      },
    },
  },
};

export const jobHistoryTool = {
  name: 'get_job_history',
  description:
    'Get historical job accounting and compute hour usage for auditing resource consumption and budgeting. Works for any user on the system—filter by username to examine any user\'s job history. Returns per-job details: job ID, name, user, account, final status (COMPLETED/FAILED/TIMEOUT), datetime (job start time), time elapsed, CPU-hours consumed, and peak memory used. Aggregates total CPU-hours across all jobs in the time window for budget tracking. Use this to: (1) understand how many compute hours jobs consumed historically, (2) estimate resource needs for similar future jobs, (3) track budgets and allocations (compare CPU-hours to available SU), (4) identify inefficient jobs (short time but high CPU/memory usage indicates poor parallelization), (5) prepare reports on resource usage, (6) audit another user\'s cluster activity. Supports lookback from 1-365+ days; default is 30 days of recent history. Combine with get_allocation_info to understand budget remaining.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Show job history for a specific username (e.g., "mst3k"). Use this to audit any user\'s cluster activity. Omit to show your own job history.',
      },
      days: {
        type: 'number',
        description: 'Number of days of history to retrieve (default: 30). Use larger values (60, 90, 365) for historical trend analysis.',
        default: 30,
      },
    },
  },
};

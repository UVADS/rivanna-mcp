import { parseLineDelimited, shellQuote } from '../utils.js';

export async function getAllocationInfo(sshClient, options = {}) {
  const { user } = options;

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

export async function getJobAccounting(sshClient, options = {}) {
  const { user, days = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split('T')[0];

  let command = `sacct --format=jobid,jobname,user,account,state,elapsed,cputimeraw,maxvmsize --noheader --start=${dateStr}`;

  if (user) {
    command += ` --user=${shellQuote(user)}`;
  }

  const output = await sshClient.exec(command);
  const lines = parseLineDelimited(output);

  const jobs = lines.map((line) => {
    const parts = line.split(/\s+/);
    const cpuSeconds = parseInt(parts[6], 10);
    const cpuHours = (cpuSeconds / 3600).toFixed(2);

    return {
      jobid: parts[0],
      jobname: parts[1],
      user: parts[2],
      account: parts[3],
      state: parts[4],
      elapsed: parts[5],
      cpuHours,
      maxMemory: parts[7],
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
  description: 'Get resource allocation limits, SU balance, and account information for users.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Filter by username (optional)',
      },
    },
  },
};

export const jobAccountingTool = {
  name: 'get_job_accounting',
  description:
    'Get job accounting and compute hour usage over a time period.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Filter by username (optional)',
      },
      days: {
        type: 'number',
        description: 'Number of days to look back (default: 30)',
        default: 30,
      },
    },
  },
};

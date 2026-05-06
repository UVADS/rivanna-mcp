import { parseSacctOutput } from '../utils.js';

export async function getAllocationInfo(sshClient, options = {}) {
  const { user, days = 30 } = options;

  let command = `sacctmgr show assoc format=cluster,account,user,maxcpus,maxmem,maxnode,maxwall,grpcpumins -p`;

  if (user) {
    command = `sacctmgr show assoc user=${user} format=cluster,account,user,maxcpus,maxmem,maxnode,maxwall,grpcpumins -p`;
  }

  const output = await sshClient.exec(command);
  const lines = output
    .trim()
    .split('\n')
    .filter((line) => line && !line.startsWith('Cluster'));

  const allocations = lines.map((line) => {
    const parts = line.split('|').filter((p) => p);
    return {
      cluster: parts[0],
      account: parts[1],
      user: parts[2],
      maxcpus: parts[3],
      maxmemory: parts[4],
      maxnode: parts[5],
      maxwall: parts[6],
      grpcpumins: parts[7],
    };
  });

  return {
    success: true,
    allocations,
  };
}

export async function getJobAccounting(sshClient, options = {}) {
  const { user, days = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split('T')[0];

  let command = `sacct --format=jobid,jobname,user,account,state,elapsed,cputimeraw,maxvmsize --noheader --start=${dateStr}`;

  if (user) {
    command += ` --user=${user}`;
  }

  const output = await sshClient.exec(command);
  const lines = output
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0);

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
  description: 'Get resource allocation limits for users and accounts.',
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

export async function getJobStatus(sshClient, options = {}) {
  const { state = 'all', user, limit = 100 } = options;

  // Use simple pipe-delimited format for reliable parsing
  let command = `squeue --format='%i|%P|%j|%u|%T|%M|%l|%D|%R'`;

  if (state !== 'all') {
    command += ` --states=${state}`;
  }

  if (user) {
    command += ` --user=${user}`;
  }

  const output = await sshClient.exec(command);
  const lines = output.trim().split('\n').filter(l => l.length > 0);

  let jobs = lines.slice(1).map(line => {
    const parts = line.split('|');
    return {
      job_id: parts[0],
      partition: parts[1],
      name: parts[2],
      user: parts[3],
      status: parts[4],
      time_used: parts[5],
      time_limit: parts[6],
      nodes: parts[7],
      node_list: parts[8],
    };
  });

  // Limit results if needed
  if (limit && jobs.length > limit) {
    jobs = jobs.slice(0, limit);
  }

  return {
    success: true,
    count: jobs.length,
    jobs,
  };
}

export const jobStatusTool = {
  name: 'get_job_status',
  description:
    'Get job status from SLURM queue. Returns running, queued, and completed jobs.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        description:
          'Job state filter: all, RUNNING, PENDING, COMPLETED, FAILED, CANCELLED',
        default: 'all',
      },
      user: {
        type: 'string',
        description: 'Filter by username (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of jobs to return',
        default: 100,
      },
    },
  },
};

import { parseSqueueOutput } from '../utils.js';

export async function getJobStatus(sshClient, options = {}) {
  const { state = 'all', user, limit = 100 } = options;

  let command = `squeue --format="%.18i %.9P %.30j %.8u %.8T %.10M %.9l %.6D %R" --noheader`;

  if (state !== 'all') {
    command += ` --states=${state}`;
  }

  if (user) {
    command += ` --user=${user}`;
  }

  command += ` --max=${limit}`;

  const output = await sshClient.exec(command);
  const jobs = parseSqueueOutput(output);

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

import { parseLineDelimited, shellQuote } from '../utils.js';

export async function listJobs(sshClient, options = {}) {
  const { state = 'all', user, limit = 100 } = options;

  // Use simple pipe-delimited format for reliable parsing
  let command = `squeue --format='%i|%P|%j|%u|%T|%M|%l|%D|%R'`;

  if (state !== 'all') {
    command += ` --states=${shellQuote(state)}`;
  }

  if (user) {
    command += ` --user=${shellQuote(user)}`;
  }

  const output = await sshClient.exec(command);
  const lines = parseLineDelimited(output);

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

export const listJobsTool = {
  name: 'list_jobs',
  description:
    'Query the SLURM job queue to monitor and track all jobs on Rivanna HPC cluster. Returns detailed information for each job: job_id (SLURM identifier), partition (which queue it\'s in: standard/parallel/gpu/largemem), job name, user/owner, current status, time elapsed, time remaining until limit, node count allocated, and specific node list. Use this tool to: (1) monitor long-running computations and check progress, (2) verify jobs submitted via submit_job actually started, (3) check queue backlog and estimate when your pending job will run, (4) identify stuck or failed jobs that need investigation with get_allocation_info, (5) understand cluster utilization patterns, (6) find job_id values needed to cancel jobs with cancel_job. Supports efficient filtering by job state, user, and result limits for large clusters.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        description:
          'Filter jobs by execution state. "all" (default) returns all jobs; "RUNNING" shows actively executing jobs; "PENDING" shows queued jobs waiting for resources; "COMPLETED" shows finished jobs; "FAILED" shows jobs that exited with error status; "CANCELLED" shows manually terminated jobs. Filtering by state is significantly faster on loaded clusters.',
        default: 'all',
      },
      user: {
        type: 'string',
        description: 'Filter to show only jobs belonging to a specific username (e.g., "mst3k"). Useful for monitoring your own jobs or troubleshooting a specific user\'s activity. Omit to see all jobs across the entire cluster.',
      },
      limit: {
        type: 'number',
        description: 'Limit the number of job records returned (default 100). Increase when managing many simultaneous jobs, decrease for faster queries when only monitoring a few jobs.',
        default: 100,
      },
    },
  },
};

import { parseLineDelimited, shellQuote } from '../utils.js';

function parseElapsedHours(elapsed) {
  if (!elapsed || elapsed === '0:00') return 0;
  let days = 0, hours = 0, minutes = 0, seconds = 0;
  if (elapsed.includes('-')) {
    const [d, rest] = elapsed.split('-');
    days = parseInt(d, 10);
    elapsed = rest;
  }
  const parts = elapsed.split(':').map(Number);
  if (parts.length === 3) [hours, minutes, seconds] = parts;
  else if (parts.length === 2) [minutes, seconds] = parts;
  return days * 24 + hours + minutes / 60 + seconds / 3600;
}

export async function listJobs(sshClient, options = {}) {
  const { state = 'all', user, limit = 100 } = options;

  // %i=job_id %j=name %S=start_time %T=state %M=elapsed %C=cpus
  let command = `squeue --format='%i|%j|%S|%T|%M|%C'`;

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
    const elapsed = parts[4] || '';
    const cpus = parseInt(parts[5], 10) || 0;
    const rawDatetime = parts[2] || '';
    const datetime = (rawDatetime === 'N/A' || rawDatetime === 'Unknown') ? '' : rawDatetime;
    const cpu_hours = Math.round(parseElapsedHours(elapsed) * cpus * 100) / 100;
    return {
      job_id: parts[0],
      name: parts[1],
      datetime,
      state: parts[3],
      elapsed,
      cpu_hours,
    };
  });

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
    'Query the SLURM job queue to monitor and track jobs on the Rivanna HPC cluster. Returns per-job columns: job_id, name, datetime (start time when running; blank when pending), state, elapsed time, and cpu_hours (elapsed × CPUs). Use this tool to: (1) monitor long-running computations and check progress, (2) verify jobs submitted via submit_job actually started, (3) check queue backlog and estimate when pending jobs will run, (4) identify stuck or failed jobs, (5) track CPU-hour consumption, (6) find job_id values needed by cancel_job. Supports filtering by state, user, and result limit.',
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

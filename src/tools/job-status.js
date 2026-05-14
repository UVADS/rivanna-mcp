import { parseLineDelimited, shellQuote } from '../utils.js';
import { getToolDef } from './loader.js';

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

export async function listJobs(sshClient, options = {}, config = {}) {
  const { state = 'all', user = config.computingId, limit = 100 } = options;

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

export const listJobsTool = getToolDef('list_jobs');

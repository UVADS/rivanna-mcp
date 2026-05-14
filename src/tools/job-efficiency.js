import { shellQuote } from '../utils.js';
import { getToolDef } from './loader.js';

export async function getJobEfficiency(sshClient, options = {}) {
  const { jobId } = options;

  if (!jobId) {
    return { success: false, error: 'jobId is required' };
  }

  let output;
  try {
    output = await sshClient.exec(`seff ${shellQuote(String(jobId))}`);
  } catch (err) {
    return {
      success: false,
      jobId,
      error: `Failed to get efficiency for job ${jobId}: ${err.message}`,
    };
  }

  if (!output || !output.trim()) {
    return {
      success: false,
      jobId,
      error: `No efficiency data for job ${jobId}. Job may still be running or not yet in accounting.`,
    };
  }

  const parsed = parseSeff(output);

  // Warn when efficiency stats aren't meaningful (running or pending jobs)
  const state = parsed.state || '';
  if (/RUNNING|PENDING/i.test(state)) {
    parsed.warning = 'Job has not completed — efficiency percentages reflect usage so far, not final values.';
  }

  return { success: true, jobId, ...parsed };
}

function parseSeff(output) {
  const result = {};

  for (const line of output.trim().split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();

    switch (key) {
      case 'Cluster':            result.cluster          = val; break;
      case 'User/Group':         result.userGroup        = val; break;
      case 'State':              result.state            = val; break;
      case 'Cores':              result.cores            = parseInt(val, 10); break;
      case 'CPU Utilized':       result.cpuUtilized      = val; break;
      case 'CPU Efficiency':     result.cpuEfficiency    = val; break;
      case 'Job Wall-clock time':result.wallclockTime    = val; break;
      case 'Memory Utilized':    result.memoryUtilized   = val; break;
      case 'Memory Efficiency':  result.memoryEfficiency = val; break;
    }
  }

  return result;
}

export const getJobEfficiencyTool = getToolDef('get_job_efficiency');

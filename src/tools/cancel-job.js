import { shellQuote } from '../utils.js';

export async function cancelJob(sshClient, options = {}) {
  const { jobId, signal = 'SIGTERM' } = options;

  if (!jobId) {
    throw new Error('Job ID is required');
  }

  // Build scancel command with optional signal
  let command = `scancel`;

  if (signal && signal !== 'SIGTERM') {
    command += ` --signal=${shellQuote(signal)}`;
  }

  command += ` ${shellQuote(jobId)}`;

  try {
    const output = await sshClient.exec(command);
    return {
      success: true,
      jobId,
      signal,
      message: `Job ${jobId} cancellation signal (${signal}) sent successfully`,
      output: output.trim(),
    };
  } catch (error) {
    // Check if error is because job doesn't exist
    if (error.message.includes('Invalid job id specified')) {
      return {
        success: false,
        jobId,
        error: `Job ID ${jobId} not found. Job may have already completed or been cancelled.`,
      };
    }
    throw new Error(`Failed to cancel job ${jobId}: ${error.message}`);
  }
}

export const cancelJobTool = {
  name: 'cancel_job',
  description:
    'Terminate a running or pending SLURM job by job ID with configurable signal handling. Use this tool to stop jobs that are consuming resources, have stalled, or are no longer needed. Sends SIGTERM (graceful shutdown) by default which allows the job process to clean up; use SIGKILL as a stronger signal if the job doesn\'t respond to SIGTERM. Essential for managing job lifecycle: check job status with list_jobs to get the job_id, then use this tool to cancel it. Returns success confirmation with the signal used and any process output. Handles the common case where a job has already completed or been cancelled (returns informative error rather than failing).',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'string',
        description: 'The SLURM job ID to cancel (required). Obtain this from list_jobs tool which lists all jobs with their IDs.',
      },
      signal: {
        type: 'string',
        description:
          'UNIX signal to send for termination: "SIGTERM" (default, graceful) allows job to clean up before exiting, "SIGKILL" (force) immediately terminates without cleanup, or other standard UNIX signals like SIGINT, SIGHUP. SIGTERM is preferred as it gives jobs time to save state.',
        default: 'SIGTERM',
      },
    },
    required: ['jobId'],
  },
};

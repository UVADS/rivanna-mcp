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
    'Cancel a running or pending SLURM job by job ID. Sends SIGTERM by default (graceful shutdown).',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'string',
        description: 'The SLURM job ID to cancel (required). Get from get_job_status tool.',
      },
      signal: {
        type: 'string',
        description:
          'Signal to send: SIGTERM (graceful, default), SIGKILL (force), or other UNIX signal',
        default: 'SIGTERM',
      },
    },
    required: ['jobId'],
  },
};

import { shellQuote } from '../utils.js';
import { getToolDef } from './loader.js';

export async function getJobDetails(sshClient, options = {}) {
  const { jobId } = options;

  if (!jobId) {
    return { success: false, error: 'jobId is required' };
  }

  let output;
  try {
    output = await sshClient.exec(`scontrol show job ${shellQuote(String(jobId))}`);
  } catch (err) {
    if (/invalid job id/i.test(err.message) || /not found/i.test(err.message)) {
      return {
        success: false,
        jobId,
        error: `Job ${jobId} not found. It may have completed and been purged from the scheduler.`,
      };
    }
    throw new Error(`Failed to get job details for ${jobId}: ${err.message}`);
  }

  if (!output || !output.trim()) {
    return { success: false, jobId, error: `No details returned for job ${jobId}.` };
  }

  return { success: true, jobId, details: parseJobDetails(output) };
}

function parseJobDetails(output) {
  // scontrol uses key=value pairs separated by whitespace; values don't contain spaces
  const pairs = {};
  const re = /(\w+)=(\S+)/g;
  let m;
  while ((m = re.exec(output)) !== null) {
    pairs[m[1]] = m[2] === '(null)' || m[2] === 'N/A' ? null : m[2];
  }

  return {
    jobId:       pairs.JobId,
    jobName:     pairs.JobName,
    state:       pairs.JobState,
    reason:      pairs.Reason,       // why pending: Priority, Resources, ReqNodeNotAvail, etc.
    user:        pairs.UserId,
    account:     pairs.Account,
    partition:   pairs.Partition,
    numNodes:    pairs.NumNodes,
    numCPUs:     pairs.NumCPUs,
    memory:      pairs.TRES ? extractFromTres(pairs.TRES, 'mem') : null,
    timeLimit:   pairs.TimeLimit,
    runTime:     pairs.RunTime,
    submitTime:  pairs.SubmitTime,
    startTime:   pairs.StartTime,
    endTime:     pairs.EndTime,
    nodeList:    pairs.NodeList,
    workDir:     pairs.WorkDir,
    stdOut:      pairs.StdOut,
    stdErr:      pairs.StdErr,
    command:     pairs.Command,
    exitCode:    pairs.ExitCode,
    priority:    pairs.Priority,
    dependency:  pairs.Dependency,
    qos:         pairs.QOS,
  };
}

function extractFromTres(tres, key) {
  const m = tres.match(new RegExp(`${key}=([^,]+)`));
  return m ? m[1] : null;
}

export const getJobDetailsTool = getToolDef('get_job_details');

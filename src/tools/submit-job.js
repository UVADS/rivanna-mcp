export async function submitJob(sshClient, options = {}) {
  const {
    jobName,
    allocation,
    partition,
    cpus,
    memory,
    time,
    nodes = 1,
    gpus,
    outputPath,
    errorPath,
    scriptContent,
    submit = false,
  } = options;

  // Validate required parameters
  const required = { jobName, allocation, partition, cpus, memory, time };
  const missing = Object.entries(required)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing required parameters: ${missing.join(', ')}`
    );
  }

  // Build SLURM header
  let slurmScript = `#!/bin/bash
#SBATCH --job-name=${jobName}
#SBATCH --account=${allocation}
#SBATCH --partition=${partition}
#SBATCH --nodes=${nodes}
#SBATCH --cpus-per-task=${cpus}
#SBATCH --mem=${memory}
#SBATCH --time=${time}`;

  if (gpus) {
    slurmScript += `\n#SBATCH --gpus-per-node=${gpus}`;
  }

  if (outputPath) {
    slurmScript += `\n#SBATCH --output=${outputPath}`;
  }

  if (errorPath) {
    slurmScript += `\n#SBATCH --error=${errorPath}`;
  }

  slurmScript += '\n\n# Job commands below:\n';
  if (scriptContent) {
    slurmScript += scriptContent;
  } else {
    slurmScript += 'echo "Job started on $(hostname)"\n';
  }

  // Create job file path - use user's home directory
  const timestamp = Date.now();
  const jobFileName = `${jobName}_${timestamp}.slurm`;

  // Write to home directory by default, or use provided path
  const homeDir = await sshClient.exec('echo $HOME');
  const homePath = homeDir.trim();
  const jobFilePath = `${homePath}/${jobFileName}`;

  // Write the job file
  const escapedScript = slurmScript.replace(/'/g, "'\\''");
  await sshClient.exec(
    `cat > '${jobFilePath}' << 'EOFSCRIPT'\n${slurmScript}\nEOFSCRIPT`
  );

  // Make executable
  await sshClient.exec(`chmod +x '${jobFilePath}'`);

  const result = {
    success: true,
    jobFilePath,
    jobFileName,
    jobScript: slurmScript,
    submitted: false,
  };

  if (submit) {
    try {
      const submitOutput = await sshClient.exec(`sbatch '${jobFilePath}'`);
      const jobIdMatch = submitOutput.match(/Submitted batch job (\d+)/);
      if (jobIdMatch) {
        result.jobId = jobIdMatch[1];
        result.submitted = true;
        result.message = `Job submitted successfully with ID ${jobIdMatch[1]}`;
      } else {
        result.warning = 'Job may have been submitted but could not parse job ID';
        result.submitOutput = submitOutput;
      }
    } catch (error) {
      result.error = `Failed to submit job: ${error.message}`;
      result.submitted = false;
    }
  }

  return result;
}

export const submitJobTool = {
  name: 'submit_job',
  description:
    'Create and optionally submit a SLURM job file to Rivanna with configurable resources and parameters.',
  inputSchema: {
    type: 'object',
    properties: {
      jobName: {
        type: 'string',
        description: 'Name for the SLURM job (alphanumeric, underscores/hyphens OK)',
      },
      allocation: {
        type: 'string',
        description: 'Allocation/account to charge compute hours to',
      },
      partition: {
        type: 'string',
        description:
          'Partition to submit to (e.g., "gpu", "parallel", "standard", "largemem")',
      },
      cpus: {
        type: 'integer',
        description: 'Number of CPU cores to request',
        minimum: 1,
      },
      memory: {
        type: 'string',
        description:
          'Memory to request in format like "16GB", "32GB", or "64GB"',
      },
      time: {
        type: 'string',
        description: 'Walltime limit in HH:MM:SS format (e.g., "01:00:00")',
      },
      nodes: {
        type: 'integer',
        description: 'Number of compute nodes (default: 1)',
        default: 1,
        minimum: 1,
      },
      gpus: {
        type: 'string',
        description:
          'Number of GPUs to request per node (e.g., "1", "2", "4") - only valid for gpu partition',
      },
      outputPath: {
        type: 'string',
        description:
          'Path for stdout output file (default: slurm-JOBID.out in job directory)',
      },
      errorPath: {
        type: 'string',
        description:
          'Path for stderr output file (default: same as output file)',
      },
      scriptContent: {
        type: 'string',
        description:
          'Shell commands/script content to execute in the job (bash commands)',
      },
      submit: {
        type: 'boolean',
        description: 'Whether to submit the job immediately to SLURM (default: false)',
        default: false,
      },
    },
    required: [
      'jobName',
      'allocation',
      'partition',
      'cpus',
      'memory',
      'time',
    ],
  },
};

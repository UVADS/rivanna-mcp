import { shellQuote } from '../utils.js';
import { basename, resolve } from 'path';
import { promises as fs } from 'fs';
import { load as parseYaml } from 'js-yaml';
import { loadSlurmDefaults } from '../commands/slurm-defaults.js';

const RIVANNA_YAML = 'rivanna.yaml';

const YAML_TEMPLATE = `# rivanna.yaml — SLURM job specification for this project
# Edit to match your environment, then run submit_job again.
# Use \`module spider <name>\` on Rivanna to find exact module versions.

job:
  name: my-job
  account: changeme        # required: your allocation (use get_allocation_info to list)
  partition: standard      # standard | gpu | parallel | largemem
  nodes: 1
  cpus: 4
  memory: 16GB
  time: "01:00:00"         # HH:MM:SS — job is killed when this expires
  # gpus: 1               # uncomment for GPU jobs; also set partition: gpu

modules:
  # List modules to load. Uncomment what you need.
  # Check what is available: exec_command "module spider <name>"
  #
  # --- Python ---
  # - miniforge            # Conda-based Python (recommended for most Python work)
  # - miniforge/py312      # pin to a specific version suffix
  #
  # --- R ---
  # - goolf                # required compiler toolchain for R
  # - R                    # or pin a version: R/4.3.1
  #
  # --- C / C++ ---
  # - gcc/11.4.0
  # - openmpi/4.1.4        # add for MPI-parallel jobs
  #
  # --- Go ---
  # - go/1.21.0
  #
  # --- Julia ---
  # - julia/1.9.0
  #
  # --- CUDA / GPU ---
  # - cuda/11.8.0
  # - cudnn/8.6.0

env_setup:
  # Arbitrary shell commands that run after modules load, before your job commands.
  # Use for activating virtual environments, installing packages, setting env vars, etc.
  # - source activate myenv
  # - pip install -r requirements.txt
  # - export OMP_NUM_THREADS=$SLURM_CPUS_PER_TASK

commands:
  # The actual work your job performs. Runs inside the job directory.
  - echo "Job started on $(hostname) at $(date)"
  # - python train.py --epochs 10
  # - Rscript analysis.R
  # - ./my_binary --flag value
  # - mpirun -np $SLURM_NTASKS ./mpi_program

files:
  # Local files to upload to the job directory before the job runs.
  # - ./script.py
  # - ./data.csv
  # - ./config.json
`;

function generateDefaultJobName() {
  const dirName = basename(process.cwd()).replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const randomChars = Math.random().toString(36).substring(2, 8);
  return `${dirName}-${randomChars}`;
}

async function readRivannaYaml(yamlPath) {
  try {
    const content = await fs.readFile(yamlPath, 'utf-8');
    return parseYaml(content) || {};
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Failed to parse ${yamlPath}: ${err.message}`);
  }
}

async function writeYamlTemplate(yamlPath) {
  await fs.writeFile(yamlPath, YAML_TEMPLATE, 'utf-8');
}

export async function submitJob(sshClient, options = {}, config = {}) {
  const slurmDefaults = await loadSlurmDefaults();

  const {
    jobName,
    allocation,
    partition,
    cpus,
    memory,
    time,
    nodes,
    gpus,
    outputPath,
    errorPath,
    scriptContent,
    filesToTransfer = [],
    submit,
    yamlPath: yamlPathOverride,
  } = options;

  // Locate and read rivanna.yaml
  const cwd = process.cwd();
  const yamlPath = yamlPathOverride ? resolve(yamlPathOverride) : resolve(cwd, RIVANNA_YAML);
  const spec = await readRivannaYaml(yamlPath);

  if (spec === null) {
    await writeYamlTemplate(yamlPath);
    return {
      success: false,
      yamlCreated: true,
      yamlPath,
      message:
        `No ${RIVANNA_YAML} found in ${cwd}. ` +
        `A template has been created at ${yamlPath}. ` +
        `Please review and edit it (set your account, modules, and commands), ` +
        `then call submit_job again.`,
    };
  }

  const job = spec.job || {};
  const yamlModules   = spec.modules   || [];
  const yamlEnvSetup  = spec.env_setup || [];
  const yamlCommands  = spec.commands  || [];
  const yamlFiles     = spec.files     || [];

  // Merge: explicit tool args > rivanna.yaml > slurm defaults > built-in defaults
  const finalJobName   = jobName    || job.name      || generateDefaultJobName();
  const finalPartition = partition  || job.partition  || slurmDefaults?.partition || 'standard';
  const finalCpus      = cpus       || job.cpus       || slurmDefaults?.cpus      || 4;
  const finalMemory    = memory     || job.memory     || slurmDefaults?.memory    || '16GB';
  const finalTime      = time       || job.time       || slurmDefaults?.time      || '01:00:00';
  const finalNodes     = nodes      || job.nodes      || slurmDefaults?.nodes     || 1;
  const finalGpus      = gpus       || job.gpus       || null;
  const finalSubmit    = submit !== undefined ? submit : true;

  const resolvedAllocation =
    allocation || job.account || slurmDefaults?.allocation || config.defaultAllocation;

  if (!resolvedAllocation || resolvedAllocation === 'changeme') {
    throw new Error(
      'No allocation set. Edit the `job.account` field in rivanna.yaml ' +
      '(use get_allocation_info to list your available allocations).'
    );
  }

  // Resolve job directory on the cluster
  const homeDir = await sshClient.exec('echo $HOME');
  const homePath = homeDir.trim();
  const slurmJobsFolder = config?.slurmJobsPath || 'rivanna-jobs';
  const tier1Dir = slurmJobsFolder.startsWith('/') ? slurmJobsFolder : `${homePath}/${slurmJobsFolder}`;
  const jobDirName = `${finalJobName}_${Date.now()}`;
  const jobDir = `${tier1Dir}/${jobDirName}`;
  await sshClient.exec(`mkdir -p ${shellQuote(jobDir)}`);

  // Transfer files: YAML list + explicit tool arg list
  const allFiles = new Set([
    ...yamlFiles.map(f => resolve(cwd, f)),
    ...filesToTransfer.map(f => resolve(f)),
  ]);
  const transferredFiles = [];
  for (const localFile of allFiles) {
    try {
      await sshClient.transferFile(localFile, jobDir);
      transferredFiles.push(localFile.split('/').pop());
    } catch (err) {
      throw new Error(`Failed to transfer ${localFile}: ${err.message}`);
    }
  }

  // Build SLURM script
  const finalOutputPath = outputPath || job.output || `${jobDir}/%j.out`;
  const finalErrorPath  = errorPath  || job.error  || `${jobDir}/%j.err`;

  let script = `#!/bin/bash\n`;
  script += `#SBATCH --job-name=${finalJobName}\n`;
  script += `#SBATCH --account=${resolvedAllocation}\n`;
  script += `#SBATCH --partition=${finalPartition}\n`;
  script += `#SBATCH --nodes=${finalNodes}\n`;
  script += `#SBATCH --cpus-per-task=${finalCpus}\n`;
  script += `#SBATCH --mem=${finalMemory}\n`;
  script += `#SBATCH --time=${finalTime}\n`;
  script += `#SBATCH --chdir=${jobDir}\n`;
  script += `#SBATCH --output=${finalOutputPath}\n`;
  script += `#SBATCH --error=${finalErrorPath}\n`;
  if (finalGpus) {
    script += `#SBATCH --gpus-per-node=${finalGpus}\n`;
  }

  if (yamlModules.length > 0) {
    script += `\n# Modules\n`;
    for (const mod of yamlModules) {
      script += `module load ${mod}\n`;
    }
  }

  if (yamlEnvSetup.length > 0) {
    script += `\n# Environment setup\n`;
    for (const cmd of yamlEnvSetup) {
      script += `${cmd}\n`;
    }
  }

  script += `\n# Job commands\n`;
  if (scriptContent) {
    script += `${scriptContent}\n`;
  } else if (yamlCommands.length > 0) {
    for (const cmd of yamlCommands) {
      script += `${cmd}\n`;
    }
  } else {
    script += `echo "Job started on $(hostname)"\n`;
  }

  // Write and chmod the job script
  const jobFileName = `${finalJobName}.slurm`;
  const jobFilePath = `${jobDir}/${jobFileName}`;
  await sshClient.exec(
    `cat > ${shellQuote(jobFilePath)} << 'EOFSCRIPT'\n${script}\nEOFSCRIPT`
  );
  await sshClient.exec(`chmod +x ${shellQuote(jobFilePath)}`);

  const result = {
    success: true,
    yamlPath,
    jobDir,
    jobDirName,
    jobFilePath,
    jobFileName,
    jobScript: script,
    outputFile: finalOutputPath,
    errorFile: finalErrorPath,
    filesTransferred: transferredFiles,
    modulesLoaded: yamlModules,
    submitted: false,
  };

  if (finalSubmit) {
    try {
      const submitOutput = await sshClient.exec(`sbatch ${shellQuote(jobFilePath)}`);
      const match = submitOutput.match(/Submitted batch job (\d+)/);
      if (match) {
        result.jobId = match[1];
        result.submitted = true;
        result.message = `Job submitted successfully with ID ${match[1]}`;
      } else {
        result.warning = 'Job may have been submitted but could not parse job ID';
        result.submitOutput = submitOutput;
      }
    } catch (err) {
      result.error = `Failed to submit job: ${err.message}`;
      result.submitted = false;
    }
  }

  return result;
}

export const submitJobTool = {
  name: 'submit_job',
  description:
    'Create and optionally submit a SLURM job to Rivanna using a rivanna.yaml file as the job specification. ' +
    'rivanna.yaml defines everything: SLURM resource parameters (account, partition, CPUs, memory, time, GPUs), ' +
    'which modules to load (any language — Python/miniforge, R, C/C++, Go, Julia, CUDA, MPI, etc.), ' +
    'environment setup commands (activate venvs, pip install, export vars), ' +
    'the actual job commands, and which local files to upload. ' +
    'If no rivanna.yaml exists in the current directory, this tool generates a commented template and stops — ' +
    'work with the user to fill it in, then call submit_job again. ' +
    'Any tool argument overrides the corresponding rivanna.yaml field for one-off adjustments. ' +
    'Creates an isolated job directory (~/rivanna-jobs/jobname_timestamp/) on the cluster, ' +
    'transfers listed files, writes the .slurm script, and submits with sbatch. ' +
    'Pair with list_jobs to monitor and cancel_job to stop jobs.',
  inputSchema: {
    type: 'object',
    properties: {
      yamlPath: {
        type: 'string',
        description:
          'Path to the rivanna.yaml spec file (optional). Defaults to rivanna.yaml in the current working directory. Override to point at a different spec file.',
      },
      jobName: {
        type: 'string',
        description:
          'Override the job name from rivanna.yaml. Displayed in queue and used for output file naming.',
      },
      allocation: {
        type: 'string',
        description:
          'Override the allocation/account from rivanna.yaml. Use get_allocation_info to list available accounts.',
      },
      partition: {
        type: 'string',
        description:
          'Override the partition from rivanna.yaml (standard | gpu | parallel | largemem).',
      },
      cpus: {
        type: 'integer',
        description: 'Override CPUs-per-task from rivanna.yaml.',
        minimum: 1,
      },
      memory: {
        type: 'string',
        description: 'Override memory from rivanna.yaml (e.g., "32GB").',
      },
      time: {
        type: 'string',
        description: 'Override wall-clock time from rivanna.yaml (HH:MM:SS).',
      },
      nodes: {
        type: 'integer',
        description: 'Override node count from rivanna.yaml.',
        minimum: 1,
      },
      gpus: {
        type: 'string',
        description:
          'Override GPUs-per-node from rivanna.yaml (e.g., "1"). Requires partition: gpu.',
      },
      outputPath: {
        type: 'string',
        description: 'Override stdout path from rivanna.yaml. Use %j for job ID.',
      },
      errorPath: {
        type: 'string',
        description: 'Override stderr path from rivanna.yaml.',
      },
      scriptContent: {
        type: 'string',
        description:
          'Override the commands section from rivanna.yaml entirely. Useful for one-off inline scripts without editing the YAML.',
      },
      filesToTransfer: {
        type: 'array',
        description:
          'Additional local files to upload beyond those listed in rivanna.yaml files:.',
        items: { type: 'string' },
      },
      submit: {
        type: 'boolean',
        description:
          'Whether to submit immediately (default: true). Set false to write the script and inspect it before submitting.',
        default: true,
      },
    },
    required: [],
  },
};

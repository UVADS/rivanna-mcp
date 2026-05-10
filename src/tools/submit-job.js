import { shellQuote } from '../utils.js';
import { basename, resolve } from 'path';
import { promises as fs } from 'fs';

// Module system configuration for Rivanna
// Defines default module loading commands for common languages/environments
const LANGUAGE_MODULES = {
  python: {
    description: 'Python with Miniforge (recommended for most Python jobs)',
    moduleLoad: 'module load miniforge',
    versions: ['py310', 'py311', 'py312'], // Common version suffixes for miniforge
    defaultVersion: 'py312',
  },
  r: {
    description: 'R with GNU compiler toolchain (goolf is required dependency)',
    moduleLoad: 'module load goolf R',
    notes: 'Run "module spider R" on Rivanna to see available R versions',
  },
  none: {
    description: 'No module loading (use system defaults)',
    moduleLoad: '',
  },
};

function generateDefaultJobName() {
  // Get current directory basename (e.g., "rivanna-work" from /path/to/rivanna-work)
  const dirName = basename(process.cwd()).replace(/[^a-z0-9-]/gi, '').toLowerCase();
  // Generate 6 random alphanumeric chars
  const randomChars = Math.random().toString(36).substring(2, 8);
  return `${dirName}-${randomChars}`;
}

async function findCodeFiles(cwd, language) {
  const files = [];
  const extensions = language === 'r' ? ['.R', '.r'] : ['.py'];
  try {
    const entries = await fs.readdir(cwd);
    for (const entry of entries) {
      if (extensions.some(ext => entry.endsWith(ext))) {
        files.push(resolve(cwd, entry));
      }
    }
  } catch (error) {
    // Directory read failed, return empty
  }
  return files;
}

async function handleDependencies(cwd, language) {
  const depInfo = {
    hasRequirements: false,
    hasPipfile: false,
    hasRenvLock: false,
    hasDescription: false,
    requirementsPath: null,
    pipfilePath: null,
    renvLockPath: null,
    descriptionPath: null,
  };

  if (language === 'python') {
    const requirementsPath = resolve(cwd, 'requirements.txt');
    const pipfilePath = resolve(cwd, 'Pipfile');

    try {
      await fs.access(requirementsPath);
      depInfo.hasRequirements = true;
      depInfo.requirementsPath = requirementsPath;
    } catch {
      // requirements.txt doesn't exist
    }

    try {
      await fs.access(pipfilePath);
      depInfo.hasPipfile = true;
      depInfo.pipfilePath = pipfilePath;
    } catch {
      // Pipfile doesn't exist
    }
  } else if (language === 'r') {
    const renvLockPath = resolve(cwd, 'renv.lock');
    const descriptionPath = resolve(cwd, 'DESCRIPTION');

    try {
      await fs.access(renvLockPath);
      depInfo.hasRenvLock = true;
      depInfo.renvLockPath = renvLockPath;
    } catch {
      // renv.lock doesn't exist
    }

    try {
      await fs.access(descriptionPath);
      depInfo.hasDescription = true;
      depInfo.descriptionPath = descriptionPath;
    } catch {
      // DESCRIPTION doesn't exist
    }
  }

  return depInfo;
}

export async function submitJob(sshClient, options = {}, config = {}) {
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
    language = 'python', // Default to Python with miniforge
    moduleVersion,
    filesToTransfer = [], // Array of local file paths to copy to job directory
    submit,
  } = options;

  // Apply sensible defaults
  const defaultJobName = generateDefaultJobName();
  const defaultTime = '01:00:00';
  const defaultSubmit = true;
  const defaultPartition = 'standard';
  const defaultCpus = 4;
  const defaultMemory = '16GB';

  const finalJobName = jobName || defaultJobName;
  const finalTime = time || defaultTime;
  const finalSubmit = submit !== undefined ? submit : defaultSubmit;
  const finalPartition = partition || defaultPartition;
  const finalCpus = cpus || defaultCpus;
  const finalMemory = memory || defaultMemory;

  // Use default allocation if not provided
  const resolvedAllocation = allocation || config.defaultAllocation;

  // Validate required parameters
  const required = { allocation: resolvedAllocation };
  const missing = Object.entries(required)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing required parameters: ${missing.join(', ')}`
    );
  }

  // Validate language
  if (!LANGUAGE_MODULES[language]) {
    throw new Error(
      `Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_MODULES).join(', ')}`
    );
  }

  // Get user's home directory
  const homeDir = await sshClient.exec('echo $HOME');
  const homePath = homeDir.trim();

  // Create a per-job directory to keep $HOME clean
  // Format: ~/rivanna-jobs/jobname_timestamp/
  const timestamp = Date.now();
  const jobDirName = `${finalJobName}_${timestamp}`;
  const jobDir = `${homePath}/rivanna-jobs/${jobDirName}`;

  // Create the job directory
  await sshClient.exec(`mkdir -p ${shellQuote(jobDir)}`);

  // Auto-detect code files and dependencies based on language
  const cwd = process.cwd();
  const codeFiles = await findCodeFiles(cwd, language);
  const depInfo = await handleDependencies(cwd, language);

  // Combine user-specified files with auto-detected code files
  const allFilesToTransfer = new Set([...filesToTransfer, ...codeFiles]);
  if (language === 'python') {
    if (depInfo.hasRequirements) {
      allFilesToTransfer.add(depInfo.requirementsPath);
    }
    if (depInfo.hasPipfile) {
      allFilesToTransfer.add(depInfo.pipfilePath);
    }
  } else if (language === 'r') {
    if (depInfo.hasRenvLock) {
      allFilesToTransfer.add(depInfo.renvLockPath);
    }
    if (depInfo.hasDescription) {
      allFilesToTransfer.add(depInfo.descriptionPath);
    }
  }

  // Transfer files to job directory
  const transferredFiles = [];
  for (const localFile of allFilesToTransfer) {
    try {
      await sshClient.transferFile(localFile, jobDir);
      // Extract just the filename for the result
      const fileName = localFile.split('/').pop();
      transferredFiles.push(fileName);
    } catch (error) {
      throw new Error(`Failed to transfer file ${localFile}: ${error.message}`);
    }
  }

  // Build module loading commands
  let moduleCommands = '';
  const langConfig = LANGUAGE_MODULES[language];
  if (langConfig.moduleLoad) {
    const finalModule = moduleVersion
      ? `${langConfig.moduleLoad}/${moduleVersion}`
      : langConfig.moduleLoad;
    moduleCommands = `${finalModule}\n`;
  }

  // Build SLURM header
  const finalOutputPath = outputPath || `${jobDir}/%j.out`; // Use %j for job ID
  const finalErrorPath = errorPath || `${jobDir}/%j.err`;

  let slurmScript = `#!/bin/bash\n#SBATCH --job-name=${finalJobName}\n#SBATCH --account=${resolvedAllocation}\n#SBATCH --partition=${finalPartition}\n#SBATCH --nodes=${nodes}\n#SBATCH --cpus-per-task=${finalCpus}\n#SBATCH --mem=${finalMemory}\n#SBATCH --time=${finalTime}\n#SBATCH --output=${finalOutputPath}\n#SBATCH --error=${finalErrorPath}`;

  if (gpus) {
    slurmScript += `\n#SBATCH --gpus-per-node=${gpus}`;
  }

  slurmScript += '\n\n# Load Rivanna modules\n';
  slurmScript += moduleCommands || '# No modules loaded\n';

  // Handle dependencies based on language
  if (language === 'python') {
    if (depInfo.hasPipfile) {
      slurmScript += '\n# Convert Pipfile to requirements.txt\n';
      slurmScript += 'pipenv requirements > requirements.txt 2>/dev/null || pipenv requirements --dev > requirements.txt 2>/dev/null || echo "# Pipfile conversion failed, using empty requirements" > requirements.txt\n';
    }
    if (depInfo.hasRequirements || depInfo.hasPipfile) {
      slurmScript += '\n# Install Python dependencies\n';
      slurmScript += 'pip install -r requirements.txt\n';
    }
  } else if (language === 'r') {
    if (depInfo.hasRenvLock) {
      slurmScript += '\n# Restore R environment from renv.lock\n';
      slurmScript += 'Rscript -e "renv::restore()" 2>/dev/null || echo "Warning: renv restore failed, some packages may not be available"\n';
    }
    if (depInfo.hasDescription) {
      slurmScript += '\n# Install R package dependencies from DESCRIPTION\n';
      slurmScript += 'Rscript -e "if(!require(\'devtools\', quietly=TRUE)) install.packages(\'devtools\'); devtools::load_all(); devtools::install_deps()" 2>/dev/null || echo "Warning: package dependency installation failed"\n';
    }
  }

  slurmScript += '\n# Job commands below:\n';
  if (scriptContent) {
    slurmScript += scriptContent;
  } else {
    slurmScript += 'echo "Job started on $(hostname)"\n';
  }

  // Create job file in the job-specific directory
  const jobFileName = `${finalJobName}.slurm`;
  const jobFilePath = `${jobDir}/${jobFileName}`;

  // Write the job file
  await sshClient.exec(
    `cat > ${shellQuote(jobFilePath)} << 'EOFSCRIPT'\n${slurmScript}\nEOFSCRIPT`
  );

  // Make executable
  await sshClient.exec(`chmod +x ${shellQuote(jobFilePath)}`);

  const result = {
    success: true,
    jobDir,
    jobDirName,
    jobFilePath,
    jobFileName,
    jobScript: slurmScript,
    language,
    moduleVersion: moduleVersion || langConfig.defaultVersion || 'default',
    modulesLoaded: langConfig.moduleLoad ? true : false,
    outputFile: finalOutputPath,
    errorFile: finalErrorPath,
    filesTransferred: transferredFiles,
    autoDetected: {
      codeFiles: codeFiles.length,
      ...(language === 'python' && {
        hasPipfile: depInfo.hasPipfile,
        hasRequirements: depInfo.hasRequirements,
      }),
      ...(language === 'r' && {
        hasRenvLock: depInfo.hasRenvLock,
        hasDescription: depInfo.hasDescription,
      }),
    },
    submitted: false,
    suggestedDefaults: {
      jobName: { suggested: defaultJobName, used: finalJobName, wasDefault: !jobName },
      partition: { suggested: defaultPartition, used: finalPartition, wasDefault: !partition },
      cpus: { suggested: defaultCpus, used: finalCpus, wasDefault: !cpus },
      memory: { suggested: defaultMemory, used: finalMemory, wasDefault: !memory },
      time: { suggested: defaultTime, used: finalTime, wasDefault: !time },
      submit: { suggested: defaultSubmit, used: finalSubmit, wasDefault: submit === undefined },
    },
  };

  if (finalSubmit) {
    try {
      const submitOutput = await sshClient.exec(`sbatch ${shellQuote(jobFilePath)}`);
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
    'Create and optionally submit a SLURM job script to Rivanna HPC cluster with smart resource configuration and automatic project setup. Handles the complete workflow: generates SLURM job script with specified resources, auto-detects language (Python/R) and dependencies (requirements.txt/Pipfile/renv.lock), transfers local code and data files to cluster, loads appropriate environment modules, installs dependencies, and optionally submits the job to the scheduler. Creates isolated job directory (~/rivanna-jobs/jobname_timestamp/) to keep your home directory organized. Returns job script content, job ID, submission status, and which files were transferred. Use this as the primary tool for launching computations on Rivanna. Combine with get_job_status to monitor job progress and cancel_job to stop jobs if needed. Supports sensible defaults for all resource parameters, so minimum call is just: {scriptContent: "your bash commands"}. Language auto-detection and dependency resolution make it ideal for Python and R projects.',
  inputSchema: {
    type: 'object',
    properties: {
      jobName: {
        type: 'string',
        description: 'Name for the SLURM job displayed in queue and output files (optional: defaults to "projectname-XXXXXX" using your current directory name plus random suffix). Good for identifying jobs in queues.',
      },
      allocation: {
        type: 'string',
        description:
          'Rivanna allocation/account name to charge compute hours against (e.g., "your-pi-account", "class-allocation"). REQUIRED - query your allocation with get_allocation_info if you don\'t know it. Determines which SU budget the job costs come from.',
      },
      partition: {
        type: 'string',
        description:
          'SLURM partition/queue to submit to (default: "standard" for CPU work): "standard" (CPU-only general purpose), "parallel" (multi-node CPU jobs), "gpu" (GPU-accelerated, pair with gpus parameter), "largemem" (high-memory nodes), or others. Choose based on your workload: GPU jobs go to gpu partition, massively parallel to parallel, everything else to standard.',
        default: 'standard',
      },
      cpus: {
        type: 'integer',
        description:
          'Number of CPU cores per task to request (default: 4). Match your application: single-threaded = 1, Python scripts = 4-8, threaded workloads = match thread count, MPI jobs = use parallel partition instead. More CPUs = longer queue waits; use get_node_resources to see what\'s available.',
        default: 4,
        minimum: 1,
      },
      memory: {
        type: 'string',
        description:
          'RAM memory to allocate per job in format "16GB", "32GB", "64GB", etc (default: "16GB"). Check get_node_resources for per-node memory limits. Common: 16GB for small jobs, 32GB+ for data processing, 128GB+ for ML training. Job fails if it exceeds this.',
        default: '16GB',
      },
      time: {
        type: 'string',
        description:
          'Maximum wall-clock runtime in HH:MM:SS format (default: "01:00:00" = 1 hour). Job gets killed when time expires. Plan conservatively: quick test = 10 minutes, typical work = 1-4 hours, long training = 8-24+ hours. Longer times = longer queues. Check job output with get_directory_usage.',
        default: '01:00:00',
      },
      nodes: {
        type: 'integer',
        description:
          'Number of compute nodes to allocate (default: 1 node). Use >1 only for multi-node MPI/distributed jobs; single-node jobs don\'t benefit from more nodes. Requires parallel partition. One node usually has 32-40 cores.',
        default: 1,
        minimum: 1,
      },
      gpus: {
        type: 'string',
        description:
          'Number of GPUs per node to request (e.g., "1", "2", "4"). ONLY valid with partition="gpu". Check get_cluster_usage_24h for GPU availability (V100, A100, A40, etc). Most jobs use 1-2 GPUs; NVIDIA often ships example code for multi-GPU.',
      },
      outputPath: {
        type: 'string',
        description:
          'Path for job stdout (normal output) file (default: job directory with auto-generated name). Use "%j" for job ID substitution (e.g., "/path/%j.out"). Stdout contains your print/echo statements and log messages.',
      },
      errorPath: {
        type: 'string',
        description:
          'Path for job stderr (error output) file (default: same directory as stdout). Captured errors, warnings, and diagnostics go here. Check this file if jobs fail.',
      },
      scriptContent: {
        type: 'string',
        description:
          'Bash shell commands to execute in your job (e.g., "python train.py" or "R CMD BATCH myscript.R"). Can be multiline. Runs in the job directory with your transferred code files available. Omitting this uses a simple echo statement.',
      },
      submit: {
        type: 'boolean',
        description:
          'Whether to immediately submit the job to the scheduler (default: true). Set to false to create the job script without submitting, review it, then submit manually with exec_command "sbatch path/to/script.slurm".',
        default: true,
      },
      language: {
        type: 'string',
        description:
          'Programming language for auto-detection and module loading: "python" (default, loads miniforge with py312), "r" (loads goolf + R), or "none" (no modules, use system defaults). Auto-detects code files: finds *.py (Python) or *.R/*.r (R) in current directory and transfers them.',
        enum: ['python', 'r', 'none'],
        default: 'python',
      },
      moduleVersion: {
        type: 'string',
        description:
          'Specific module version to load (optional). For Python: "py310", "py311", "py312" (default). For R: exact R version string. Only needed if you need non-default version. Query available with exec_command "module avail python" or "module spider R".',
      },
      filesToTransfer: {
        type: 'array',
        description:
          'List of local file paths to upload to job directory before running (optional, e.g., ["/path/to/data.csv", "./config.json"]). Absolute or relative paths. Auto-detects code files + requirements.txt/Pipfile (Python) or renv.lock/DESCRIPTION (R), so usually unnecessary. Pair with scriptContent that references these files by name.',
        items: {
          type: 'string',
        },
      },
    },
    required: [],
  },
};

// Export module configuration for reference/testing
export { LANGUAGE_MODULES };

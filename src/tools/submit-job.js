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

  let slurmScript = `#!/bin/bash
#SBATCH --job-name=${finalJobName}
#SBATCH --account=${resolvedAllocation}
#SBATCH --partition=${finalPartition}
#SBATCH --nodes=${nodes}
#SBATCH --cpus-per-task=${finalCpus}
#SBATCH --mem=${finalMemory}
#SBATCH --time=${finalTime}
#SBATCH --output=${finalOutputPath}
#SBATCH --error=${finalErrorPath}`;

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
    'Create and optionally submit a SLURM job file to Rivanna with configurable resources and parameters. Default values: job name uses project folder name + 6 random chars, walltime limit 1 hour, submit immediately set to YES. These are suggested but can be overridden during the interview.',
  inputSchema: {
    type: 'object',
    properties: {
      jobName: {
        type: 'string',
        description: 'Name for the SLURM job (optional: defaults to project-folder-XXXXXX with 6 random alphanumeric chars)',
      },
      allocation: {
        type: 'string',
        description:
          'Allocation/account to charge compute hours to (optional: uses default from setup if not specified)',
      },
      partition: {
        type: 'string',
        description:
          'Partition to submit to (e.g., "gpu", "parallel", "standard", "largemem") (optional: defaults to "standard")',
      },
      cpus: {
        type: 'integer',
        description: 'Number of CPU cores to request (optional: defaults to 4)',
        minimum: 1,
      },
      memory: {
        type: 'string',
        description:
          'Memory to request in format like "16GB", "32GB", or "64GB" (optional: defaults to "16GB")',
      },
      time: {
        type: 'string',
        description: 'Walltime limit in HH:MM:SS format (optional: defaults to "01:00:00" / 1 hour)',
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
        description: 'Whether to submit the job immediately to SLURM (default: true)',
      },
      language: {
        type: 'string',
        description:
          'Programming language/environment: "python" (with miniforge), "r" (with goolf), or "none" (default: python)',
        enum: ['python', 'r', 'none'],
        default: 'python',
      },
      moduleVersion: {
        type: 'string',
        description:
          'Optional specific module version (e.g., "py310", "py311" for Python, or an R version). If omitted, uses default.',
      },
      filesToTransfer: {
        type: 'array',
        description:
          'Optional array of local file paths to copy to the job directory. Files are transferred via rsync to login.hpc.virginia.edu',
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

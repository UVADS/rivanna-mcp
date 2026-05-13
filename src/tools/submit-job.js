import { shellQuote } from '../utils.js';
import { basename, resolve } from 'path';
import { promises as fs } from 'fs';
import { load as parseYaml } from 'js-yaml';
import { loadSlurmDefaults } from '../commands/slurm-defaults.js';

const RIVANNA_YAML = 'rivanna.yaml';

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

// Scan the project directory and return detected language hints
async function detectProject(dir) {
  let entries = [];
  try { entries = await fs.readdir(dir); } catch {}

  const has = (exts) => entries.some(f => exts.some(e => f.endsWith(e)));
  const find = (exts) => entries.filter(f => exts.some(e => f.endsWith(e)));
  const exact = (names) => entries.some(f => names.includes(f));

  const pyFiles   = find(['.py']);
  const rFiles    = find(['.R', '.r', '.Rmd', '.rmd']);
  const goFiles   = find(['.go']);
  const cFiles    = find(['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp']);
  const juliaFiles= find(['.jl']);
  const rustFiles = find(['.rs']);
  const matlabFiles = find(['.m']);

  return {
    python: {
      detected: pyFiles.length > 0,
      scripts: pyFiles,
      hasRequirements: exact(['requirements.txt']),
      hasPipfile:      exact(['Pipfile']),
      hasPyproject:    exact(['pyproject.toml']),
      hasCondaEnv:     entries.some(f => f === 'environment.yml' || f === 'conda.yml'),
    },
    r: {
      detected: rFiles.length > 0,
      scripts: rFiles,
      hasRenv:        exact(['renv.lock']),
      hasDescription: exact(['DESCRIPTION']),
    },
    go: {
      detected: goFiles.length > 0,
      scripts: goFiles,
      hasGoMod: exact(['go.mod']),
    },
    c: {
      detected: cFiles.length > 0,
      scripts: cFiles,
      hasMakefile:   exact(['Makefile', 'makefile', 'GNUmakefile']),
      hasCmake:      exact(['CMakeLists.txt']),
    },
    julia: {
      detected: juliaFiles.length > 0,
      scripts: juliaFiles,
      hasProject: exact(['Project.toml']),
    },
    rust: {
      detected: rustFiles.length > 0,
      hasCargo: exact(['Cargo.toml']),
    },
    matlab: {
      detected: matlabFiles.length > 0,
      scripts: matlabFiles,
    },
  };
}

// Build a tailored rivanna.yaml template based on what we found in the directory
function generateYamlTemplate(proj, dirName) {
  // Determine the dominant language (first match wins; multi-language projects are rare)
  const dominant =
    proj.python.detected ? 'python' :
    proj.r.detected      ? 'r'      :
    proj.go.detected     ? 'go'     :
    proj.c.detected      ? 'c'      :
    proj.julia.detected  ? 'julia'  :
    proj.rust.detected   ? 'rust'   :
    proj.matlab.detected ? 'matlab' :
    null;

  const jobName = dirName || 'my-job';

  // --- Build sections ---

  let modulesSection = '';
  let envSection = '';
  let commandsSection = '';
  let filesSection = '';
  let detectionNote = '';

  // ── Python ──────────────────────────────────────────────────────────────
  if (dominant === 'python') {
    detectionNote = `# Detected: Python project (${proj.python.scripts.length} .py file(s) found)\n`;

    modulesSection = `modules:
  - miniforge            # Conda-based Python — recommended on Rivanna
  # - miniforge/py312    # pin to a specific version if needed
  # Other modules your scripts may need:
  # - cuda/11.8.0        # uncomment if using GPU/CUDA
  # - cudnn/8.6.0`;

    const envLines = [];
    if (proj.python.hasCondaEnv) {
      envLines.push(`  - conda env create -f environment.yml  # create env from your conda spec`);
      envLines.push(`  - source activate $(head -1 environment.yml | sed 's/name: //')`);
    } else if (proj.python.hasPipfile) {
      envLines.push(`  - pip install pipenv`);
      envLines.push(`  - pipenv install`);
      envLines.push(`  - source $(pipenv --venv)/bin/activate`);
    } else if (proj.python.hasRequirements) {
      envLines.push(`  - pip install -r requirements.txt`);
    } else if (proj.python.hasPyproject) {
      envLines.push(`  - pip install .`);
    } else {
      envLines.push(`  # - pip install -r requirements.txt   # uncomment if you have a requirements file`);
    }
    envLines.push(`  # - export PYTHONPATH=$PWD             # add project root to Python path if needed`);
    envSection = `env_setup:\n${envLines.join('\n')}`;

    const mainScript = proj.python.scripts.find(f => f.match(/main|train|run|app|script/i))
      || proj.python.scripts[0];
    const scriptName = mainScript || 'your_script.py';
    commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - python ${scriptName}
  # - python ${scriptName} --arg value   # pass arguments as needed`;

    const fileList = proj.python.scripts.slice(0, 5).map(f => `  - ./${f}`).join('\n');
    const depFiles = [
      proj.python.hasRequirements ? '  - ./requirements.txt' : null,
      proj.python.hasPipfile      ? '  - ./Pipfile'          : null,
      proj.python.hasPyproject    ? '  - ./pyproject.toml'   : null,
      proj.python.hasCondaEnv     ? '  - ./environment.yml'  : null,
    ].filter(Boolean).join('\n');
    filesSection = `files:\n${fileList}${depFiles ? '\n' + depFiles : ''}`;

  // ── R ───────────────────────────────────────────────────────────────────
  } else if (dominant === 'r') {
    detectionNote = `# Detected: R project (${proj.r.scripts.length} .R/.Rmd file(s) found)\n`;

    modulesSection = `modules:
  - goolf                # required compiler toolchain — must load before R
  - R                    # or pin a version: R/4.3.1
  # - cuda/11.8.0        # uncomment if using GPU via torch or tensorflow`;

    const envLines = [];
    if (proj.r.hasRenv) {
      envLines.push(`  - Rscript -e "renv::restore()"   # restore packages from renv.lock`);
    } else if (proj.r.hasDescription) {
      envLines.push(`  - Rscript -e "devtools::install_deps()"   # install deps from DESCRIPTION`);
    } else {
      envLines.push(`  # - Rscript -e "install.packages(c('tidyverse','data.table'))"   # install packages`);
    }
    envSection = `env_setup:\n${envLines.join('\n')}`;

    const mainScript = proj.r.scripts.find(f => f.match(/main|run|analysis|script/i))
      || proj.r.scripts[0];
    const scriptName = mainScript || 'your_script.R';
    commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - Rscript ${scriptName}
  # - Rscript ${scriptName} --args value1 value2`;

    const fileList = proj.r.scripts.slice(0, 5).map(f => `  - ./${f}`).join('\n');
    const depFiles = [
      proj.r.hasRenv        ? '  - ./renv.lock'    : null,
      proj.r.hasDescription ? '  - ./DESCRIPTION'  : null,
    ].filter(Boolean).join('\n');
    filesSection = `files:\n${fileList}${depFiles ? '\n' + depFiles : ''}`;

  // ── Go ──────────────────────────────────────────────────────────────────
  } else if (dominant === 'go') {
    detectionNote = `# Detected: Go project (${proj.go.scripts.length} .go file(s) found)\n`;

    modulesSection = `modules:
  - go/1.21.0            # adjust version as needed (module spider go)`;

    const envLines = [];
    if (proj.go.hasGoMod) {
      envLines.push(`  - go mod download   # fetch dependencies from go.mod`);
    }
    envSection = `env_setup:\n${envLines.join('\n')}`;

    commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - go build -o ./bin/app .
  - ./bin/app
  # - go run main.go     # alternatively run without pre-building`;

    filesSection = `files:\n${proj.go.scripts.slice(0, 8).map(f => `  - ./${f}`).join('\n')}${proj.go.hasGoMod ? '\n  - ./go.mod\n  - ./go.sum' : ''}`;

  // ── C / C++ ─────────────────────────────────────────────────────────────
  } else if (dominant === 'c') {
    const hasMpi = proj.c.scripts.some(f => f.match(/mpi/i));
    detectionNote = `# Detected: C/C++ project (${proj.c.scripts.length} source file(s) found)\n`;

    modulesSection = `modules:
  - gcc/11.4.0           # GNU C/C++ compiler
  # - openmpi/4.1.4      # uncomment if using MPI for parallel jobs
  # - cuda/11.8.0        # uncomment if using CUDA/GPU`;

    if (proj.c.hasMakefile) {
      envSection = `env_setup:\n  - make   # build from Makefile`;
      commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  ${hasMpi ? '- mpirun -np $SLURM_NTASKS ./your_binary' : '- ./your_binary'}
  # Adjust binary name and arguments above`;
    } else if (proj.c.hasCmake) {
      envSection = `env_setup:
  - mkdir -p build && cd build
  - cmake ..
  - make -j$SLURM_CPUS_PER_TASK`;
      commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - ./build/your_binary`;
    } else {
      envSection = `env_setup:
  - gcc -O2 -o ./my_program ${proj.c.scripts.filter(f=>f.endsWith('.c')).slice(0,3).join(' ') || 'main.c'}`;
      commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - ./my_program`;
    }

    filesSection = `files:\n${proj.c.scripts.slice(0, 8).map(f => `  - ./${f}`).join('\n')}${proj.c.hasMakefile ? '\n  - ./Makefile' : ''}${proj.c.hasCmake ? '\n  - ./CMakeLists.txt' : ''}`;

  // ── Julia ────────────────────────────────────────────────────────────────
  } else if (dominant === 'julia') {
    detectionNote = `# Detected: Julia project (${proj.julia.scripts.length} .jl file(s) found)\n`;

    modulesSection = `modules:
  - julia/1.9.0          # adjust version as needed (module spider julia)`;

    const envLines = [];
    if (proj.julia.hasProject) {
      envLines.push(`  - julia --project=. -e "using Pkg; Pkg.instantiate()"   # restore packages from Project.toml`);
    }
    envSection = `env_setup:\n${envLines.join('\n') || '  # - julia -e "using Pkg; Pkg.add(\\"SomePackage\\")"'}`;

    const mainScript = proj.julia.scripts.find(f => f.match(/main|run|script/i))
      || proj.julia.scripts[0];
    commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - julia --project=. ${mainScript || 'your_script.jl'}`;

    filesSection = `files:\n${proj.julia.scripts.slice(0, 5).map(f => `  - ./${f}`).join('\n')}${proj.julia.hasProject ? '\n  - ./Project.toml\n  - ./Manifest.toml' : ''}`;

  // ── Rust ─────────────────────────────────────────────────────────────────
  } else if (dominant === 'rust') {
    detectionNote = `# Detected: Rust project (Cargo.toml found)\n`;

    modulesSection = `modules:
  # Rivanna may not have a Rust module; check with: module spider rust
  # If not available, install via rustup in env_setup below`;

    envSection = `env_setup:
  - curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  - source $HOME/.cargo/env
  - cargo build --release`;

    commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - ./target/release/your_binary`;

    filesSection = `files:\n  - ./Cargo.toml\n  - ./Cargo.lock\n  - ./src/`;

  // ── MATLAB ───────────────────────────────────────────────────────────────
  } else if (dominant === 'matlab') {
    detectionNote = `# Detected: MATLAB project (${proj.matlab.scripts.length} .m file(s) found)\n`;

    modulesSection = `modules:
  - matlab               # check available versions: module spider matlab`;

    const mainScript = proj.matlab.scripts.find(f => f.match(/main|run|script/i))
      || proj.matlab.scripts[0];
    const funcName = mainScript ? mainScript.replace('.m', '') : 'your_function';
    envSection = `env_setup:
  # - export MLM_LICENSE_FILE=27000@license.server   # if license server is needed`;

    commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  - matlab -nodisplay -nosplash -r "${funcName}; exit"`;

    filesSection = `files:\n${proj.matlab.scripts.slice(0, 5).map(f => `  - ./${f}`).join('\n')}`;

  // ── Unknown / generic ────────────────────────────────────────────────────
  } else {
    detectionNote = `# No dominant language detected — generic template generated.\n# Uncomment the modules and commands that match your project.\n`;

    modulesSection = `modules:
  # Uncomment the modules your job needs. Check: exec_command "module spider <name>"
  #
  # - miniforge            # Python (Conda)
  # - goolf                # R toolchain
  # - R
  # - gcc/11.4.0           # C/C++
  # - openmpi/4.1.4        # MPI
  # - go/1.21.0
  # - julia/1.9.0
  # - cuda/11.8.0`;

    envSection = `env_setup:
  # Shell commands to run after modules load (activate envs, install deps, etc.)
  # - source activate myenv
  # - pip install -r requirements.txt`;

    commandsSection = `commands:
  - echo "Job started on $(hostname) at $(date)"
  # - python your_script.py
  # - Rscript your_script.R
  # - ./your_binary`;

    filesSection = `files:
  # - ./your_script
  # - ./data.csv`;
  }

  return `${detectionNote}# rivanna.yaml — SLURM job specification for this project
# Edit to match your environment, then run submit_job again.
# Use \`module spider <name>\` on Rivanna to find exact module versions.

job:
  name: ${jobName}
  account: changeme        # required — use get_allocation_info to list your accounts
  partition: standard      # standard | gpu | parallel | largemem
  nodes: 1
  cpus: 4
  memory: 16GB
  time: "01:00:00"         # HH:MM:SS — job is killed when this expires
  # gpus: 1               # uncomment for GPU jobs; also set partition: gpu

${modulesSection}

${envSection}

${commandsSection}

${filesSection}
`;
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
    const proj = await detectProject(cwd);
    const dirName = basename(cwd).replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const template = generateYamlTemplate(proj, dirName);
    await fs.writeFile(yamlPath, template, 'utf-8');
    const detected = ['python','r','go','c','julia','rust','matlab'].find(l => proj[l]?.detected) || 'unknown';
    return {
      success: false,
      yamlCreated: true,
      yamlPath,
      detectedLanguage: detected,
      message:
        `No ${RIVANNA_YAML} found in ${cwd}. ` +
        `A tailored template has been created at ${yamlPath} ` +
        `(detected: ${detected}). ` +
        `Please review it — set your account, confirm the modules and commands — ` +
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

import readline from 'readline';
import { promisify } from 'util';

// Default values from SLURM-SUBMISSION-PROCEDURE.md
export const INTERVIEW_DEFAULTS = {
  allocation: 'mageelab',
  partition: 'standard',
  cpus: 4,
  memory: '16GB',
  time: '01:00:00',
  nodes: 1,
};

export const PARTITION_OPTIONS = {
  standard: 'Standard CPU-only compute nodes (general purpose)',
  gpu: 'GPU-accelerated nodes (use for ML, deep learning)',
  parallel: 'Multi-node CPU cluster (use for MPI, distributed jobs)',
  largemem: 'High-memory nodes (use for large datasets)',
};

export const ALLOCATION_OPTIONS = ['mageelab', 'sds_corefaculty', 'sds-magee'];

async function promptAllocation(question) {
  console.log('\n📍 ALLOCATION ACCOUNT');
  console.log(`Available: ${ALLOCATION_OPTIONS.join(', ')}`);
  const input = await question(
    `Allocation (default: ${INTERVIEW_DEFAULTS.allocation}): `
  );
  const value = input.trim() || INTERVIEW_DEFAULTS.allocation;

  if (!ALLOCATION_OPTIONS.includes(value)) {
    console.warn(`⚠️  Warning: "${value}" not in known options, but accepting it`);
  }
  return value;
}

async function promptPartition(question) {
  console.log('\n📍 PARTITION (queue)');
  Object.entries(PARTITION_OPTIONS).forEach(([key, desc]) => {
    console.log(`  ${key}: ${desc}`);
  });
  const input = await question(
    `Partition (default: ${INTERVIEW_DEFAULTS.partition}): `
  );
  const value = input.trim() || INTERVIEW_DEFAULTS.partition;

  if (!Object.keys(PARTITION_OPTIONS).includes(value)) {
    console.warn(`⚠️  Warning: "${value}" not in known options, but accepting it`);
  }
  return value;
}

async function promptCpus(question) {
  console.log('\n📍 CPUs PER TASK');
  console.log('  Single-threaded code: 1');
  console.log('  Typical Python/R scripts: 4-8');
  console.log('  Threaded workloads: match your thread count');
  const input = await question(`CPUs (default: ${INTERVIEW_DEFAULTS.cpus}): `);
  const value = input.trim() ? parseInt(input) : INTERVIEW_DEFAULTS.cpus;

  if (isNaN(value) || value < 1 || value > 40) {
    console.warn('⚠️  Warning: CPU count should be 1-40. Using your input anyway.');
  }
  return value;
}

async function promptMemory(question) {
  console.log('\n📍 MEMORY');
  console.log('  Small jobs: 16GB');
  console.log('  Data processing: 32GB-64GB');
  console.log('  ML training: 128GB+');
  console.log('  ⚠️  Job fails if memory limit is exceeded');
  const input = await question(`Memory (default: ${INTERVIEW_DEFAULTS.memory}): `);
  return input.trim() || INTERVIEW_DEFAULTS.memory;
}

async function promptTime(question) {
  console.log('\n📍 WALL-CLOCK TIME (HH:MM:SS)');
  console.log('  Quick test: 00:10:00');
  console.log('  Typical work: 01:00:00 - 04:00:00');
  console.log('  Long training: 08:00:00+');
  console.log('  ⚠️  Job killed when time expires; longer times = longer queue waits');
  const input = await question(`Time (default: ${INTERVIEW_DEFAULTS.time}): `);
  return input.trim() || INTERVIEW_DEFAULTS.time;
}

async function promptNodes(question, partition) {
  if (partition !== 'parallel') {
    return 1;
  }

  console.log('\n📍 NODES (parallel jobs only)');
  console.log('  Minimum: 2 nodes for distributed jobs');
  console.log('  Each node has ~32-40 cores');
  const input = await question(`Nodes (default: ${INTERVIEW_DEFAULTS.nodes}): `);
  const value = input.trim() ? parseInt(input) : INTERVIEW_DEFAULTS.nodes;

  if (isNaN(value) || value < 1) {
    console.warn('⚠️  Using default 1 node');
    return 1;
  }
  return value;
}

async function promptGpus(question, partition) {
  if (partition !== 'gpu') {
    return null;
  }

  console.log('\n📍 GPUs (gpu partition only)');
  console.log('  Options: 1, 2, or 4 GPUs per node');
  console.log('  Most jobs use 1-2; check availability before requesting 4');
  const input = await question('GPUs (optional, or press Enter to skip): ');
  return input.trim() || null;
}

export async function runSlurmInterview() {
  // Create readline interface only when function is called, not at module import time
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = promisify(rl.question).bind(rl);

  console.log('\n✨ Rivanna SLURM Job Submission Preferences');
  console.log('════════════════════════════════════════════');
  console.log('This will set up your default SLURM parameters.');
  console.log('You can adjust them per-job later.\n');

  try {
    const allocation = await promptAllocation(question);
    const partition = await promptPartition(question);
    const cpus = await promptCpus(question);
    const memory = await promptMemory(question);
    const time = await promptTime(question);
    const nodes = await promptNodes(question, partition);
    const gpus = await promptGpus(question, partition);

    // Build final config
    const config = {
      allocation,
      partition,
      cpus,
      memory,
      time,
      nodes,
      ...(gpus && { gpus }),
      createdAt: new Date().toISOString(),
    };

    // Present confirmation
    console.log('\n✅ CONFIRMATION');
    console.log('════════════════════════════════════════════');
    console.log(`Allocation:    ${config.allocation}`);
    console.log(`Partition:     ${config.partition}`);
    console.log(`CPUs:          ${config.cpus}`);
    console.log(`Memory:        ${config.memory}`);
    console.log(`Time:          ${config.time}`);
    console.log(`Nodes:         ${config.nodes}`);
    if (config.gpus) {
      console.log(`GPUs:          ${config.gpus}`);
    }
    console.log('════════════════════════════════════════════\n');

    const confirm = await question('Save these preferences? (yes/no): ');
    rl.close();

    if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
      return config;
    } else {
      console.log('❌ Preferences not saved. Exiting.');
      process.exit(1);
    }
  } catch (error) {
    rl.close();
    throw error;
  }
}

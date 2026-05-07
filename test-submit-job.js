#!/usr/bin/env node

/**
 * Test script for submit_job tool
 * Tests job script generation without submitting
 */

import { submitJob } from './src/tools/submit-job.js';

// Mock SSH client for testing
class MockSSHClient {
  async exec(command) {
    // Return realistic responses for common commands
    if (command === 'echo $HOME') {
      return '/home/nmagee\n';
    }
    if (command.includes('sbatch')) {
      return 'Submitted batch job 12345678\n';
    }
    if (command.includes('cat >') || command.includes('chmod')) {
      return '';
    }
    return '';
  }
}

const mockSSH = new MockSSHClient();

const testCases = [
  {
    name: 'Simple Python job',
    params: {
      jobName: 'python_analysis',
      allocation: 'default',
      partition: 'standard',
      cpus: 4,
      memory: '16GB',
      time: '02:00:00',
      scriptContent: 'python my_script.py',
      submit: false,
    },
  },
  {
    name: 'GPU job (deep learning)',
    params: {
      jobName: 'ml_training',
      allocation: 'default',
      partition: 'gpu',
      cpus: 8,
      memory: '32GB',
      time: '06:00:00',
      gpus: '2',
      scriptContent: `module load cuda/11.8
python train.py --batch-size 128`,
      submit: false,
    },
  },
  {
    name: 'Multi-node parallel job',
    params: {
      jobName: 'parallel_sim',
      allocation: 'default',
      partition: 'parallel',
      cpus: 16,
      memory: '64GB',
      time: '12:00:00',
      nodes: 4,
      scriptContent: `module load openmpi
mpirun -np 64 ./simulation`,
      submit: false,
    },
  },
  {
    name: 'Job with custom output paths',
    params: {
      jobName: 'data_processing',
      allocation: 'default',
      partition: 'standard',
      cpus: 2,
      memory: '8GB',
      time: '01:30:00',
      outputPath: '/home/nmagee/logs/job_%j.out',
      errorPath: '/home/nmagee/logs/job_%j.err',
      scriptContent: `cd /home/nmagee/data
./process_data.sh`,
      submit: false,
    },
  },
];

async function runTests() {
  console.log('\n🧪 Testing submit_job tool\n');
  console.log('='.repeat(70));

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log('-'.repeat(70));

    try {
      const result = await submitJob(mockSSH, testCase.params);

      if (result.success) {
        console.log('✅ Success!');
        console.log(`\n📄 Job file: ${result.jobFilePath}`);
        console.log('\n📋 Generated SLURM Script:');
        console.log('```bash');
        console.log(result.jobScript);
        console.log('```');

        if (result.jobId) {
          console.log(`\n✨ Submitted with Job ID: ${result.jobId}`);
        }
      } else {
        console.log('❌ Failed:', result.error);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    console.log('\n' + '='.repeat(70));
  }

  console.log('\n✨ All tests completed!\n');
}

runTests().catch(console.error);

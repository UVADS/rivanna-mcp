import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { runSlurmInterview } from '../utils/slurm-interview.js';

const CONFIG_DIR = join(homedir(), '.rivanna-mcp');
const SLURM_DEFAULTS_FILE = join(CONFIG_DIR, 'slurm-defaults.json');

export async function runSlurmDefaults() {
  try {
    // Check if file already exists
    let exists = false;
    try {
      await fs.access(SLURM_DEFAULTS_FILE);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      console.log(`\n📄 Found existing preferences at: ${SLURM_DEFAULTS_FILE}`);
      const existing = JSON.parse(
        await fs.readFile(SLURM_DEFAULTS_FILE, 'utf-8')
      );
      console.log('\nCurrent settings:');
      console.log(JSON.stringify(existing, null, 2));

      // In a real interactive CLI, you'd ask if they want to update
      // For now, just show and exit
      console.log(
        '\n💡 Tip: Delete the file and re-run to create new preferences.'
      );
      return;
    }

    // Run the interview
    const config = await runSlurmInterview();

    // Ensure config directory exists
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }

    // Write to file
    await fs.writeFile(
      SLURM_DEFAULTS_FILE,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    console.log(`\n✅ Preferences saved to: ${SLURM_DEFAULTS_FILE}`);
    console.log('\n📌 These defaults will be used by:');
    console.log('   • Claude Code via submit_job tool');
    console.log('   • Any other tools that reference them');
    console.log('\n💡 Tip: To update preferences later, delete the file and re-run this command.');
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

export async function loadSlurmDefaults() {
  try {
    const content = await fs.readFile(SLURM_DEFAULTS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function getSlurmDefaultsPath() {
  return SLURM_DEFAULTS_FILE;
}

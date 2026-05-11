#!/usr/bin/env node

async function main() {
  const command = process.argv[2];

  if (command === 'setup') {
    const setup = await import('./setup.js');
    await setup.runSetup();
  } else if (command === 'slurm-defaults') {
    const slurmDefaults = await import('./commands/slurm-defaults.js');
    await slurmDefaults.runSlurmDefaults();
  } else if (command === undefined) {
    // Run the MCP server
    await import('./index.js');
  } else {
    console.error(`Unknown command: ${command}`);
    console.error(`\nUsage:`);
    console.error(`  rivanna-mcp              # Start MCP server`);
    console.error(`  rivanna-mcp setup        # Configure Rivanna connection`);
    console.error(`  rivanna-mcp slurm-defaults # Set SLURM job preferences`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

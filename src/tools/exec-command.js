export async function execCommand(sshClient, args) {
  const { command } = args;

  if (!command || !command.trim()) {
    return {
      success: false,
      error: 'Command cannot be empty',
    };
  }

  try {
    const output = await sshClient.exec(command);
    return {
      success: true,
      command,
      output: output.trim(),
    };
  } catch (e) {
    return {
      success: false,
      command,
      error: e.message || 'Command execution failed',
    };
  }
}

export const execCommandTool = {
  name: 'exec_command',
  description:
    'Execute an arbitrary shell command on Rivanna HPC cluster and return output. Runs bash commands with full shell capabilities (piping, redirection, environment variables, aliases). Use this as a catch-all for operations not covered by specialized tools. ' +
    'NEVER use this tool to submit SLURM jobs — do NOT call sbatch, srun, or construct .slurm scripts manually here. ' +
    'SLURM job submission is exclusively handled by the submit_job tool, which manages rivanna.yaml specs, file transfer, job directory creation, and sbatch correctly. Using exec_command to submit jobs bypasses all of that and will produce unreliable results. ' +
    'Legitimate use cases: (1) inspect job directories and files (ls, find, cat), (2) check module availability (module avail, module spider), (3) manage files (cp, mv, rm, chmod), (4) check environment (printenv, which, whoami), (5) read cluster info (sinfo, sacct variations), (6) install/test commands, (7) compile code, (8) debug shell scripts. ' +
    'Returns command output as plain text. Works in your default shell environment with your current working directory context.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute on Rivanna (e.g., "ls -al /home/nmagee/projects/", "module avail python", "find . -name *.out -size +100M"). Supports pipes, redirections, environment variables, and multi-line scripts.',
      },
    },
    required: ['command'],
  },
};

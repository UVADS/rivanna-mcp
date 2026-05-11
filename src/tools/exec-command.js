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
    'Execute an arbitrary shell command on Rivanna HPC cluster and return output. Runs bash commands with full shell capabilities (piping, redirection, environment variables, aliases). Use this as a catch-all for operations not covered by specialized tools. Common use cases: (1) inspect job directories and files (ls, find, cat), (2) check module availability (module avail, module spider), (3) manage files (cp, mv, rm, chmod), (4) check environment (printenv, which, whoami), (5) run cluster commands (sinfo, sacct variations), (6) install/test commands, (7) compile code, (8) debug shell scripts. Returns command output as plain text. Works in your default shell environment with your current working directory context. Good for one-off exploration; for frequently-used operations, prefer specialized tools (list_jobs, submit_job, etc) which are more robust.',
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

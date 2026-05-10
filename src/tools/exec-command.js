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
  description: 'Execute an arbitrary shell command on Rivanna and return the output.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute (e.g., "ls -al /home/nem2p/projects/")',
      },
    },
    required: ['command'],
  },
};

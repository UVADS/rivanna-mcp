import { getToolDef } from './loader.js';

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

export const execCommandTool = getToolDef('exec_command');

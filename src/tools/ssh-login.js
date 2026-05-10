import { execSync } from 'child_process';
import { loadConfig } from '../config.js';

export function sshLogin() {
  try {
    const config = loadConfig();
    const sshKey = config.sshKey;
    const username = config.username;

    if (!sshKey || !username) {
      return {
        success: false,
        error: 'SSH key or username not configured in ~/.rivanna-mcp/config.json',
      };
    }

    const command = `ssh -i ${sshKey} ${username}@login.hpc.virginia.edu`;

    // Execute SSH with stdio inherited for interactive session
    execSync(command, { stdio: 'inherit' });

    return {
      success: true,
      message: 'SSH session closed',
    };
  } catch (e) {
    return {
      success: false,
      error: e.message || 'SSH login failed',
    };
  }
}

export const sshLoginTool = {
  name: 'ssh_login',
  description:
    'Open an interactive SSH terminal session to Rivanna login node (login.hpc.virginia.edu) using your configured SSH key. Provides full shell access for interactive work: monitoring jobs, editing files, compiling code, debugging issues. Use when you need persistent terminal access or interactive exploration. Unlike exec_command which returns output, this creates a live terminal where you can run multiple commands, use text editors (nano/vim), monitor processes with top/htop, or run interactive tools. Connection uses your SSH key configured in ~/.rivanna-mcp/config.json (requires valid HPC username and SSH key path). Good for: (1) manual job monitoring, (2) interactive debugging, (3) setting up environment, (4) real-time file inspection, (5) running interactive tools (tmux, screen, R, Python REPL). When session ends, you return to your local shell.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

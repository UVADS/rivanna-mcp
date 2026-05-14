import { execSync } from 'child_process';
import { loadConfig } from '../config.js';
import { getToolDef } from './loader.js';

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

export const sshLoginTool = getToolDef('ssh_login');

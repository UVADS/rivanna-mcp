# Rivanna MCP Dual-Mode Refactoring

## Overview
The rivanna-mcp has been refactored to support two operating modes:
- **Remote Mode**: User runs Claude Code on their local workstation, commands are sent to Rivanna via SSH
- **Local Mode**: User is already logged into a Rivanna compute node and runs commands directly

## Changes Made

### New Files
1. **`src/local-client.js`**: LocalClient class that executes commands directly via shell instead of SSH
2. **`src/client-factory.js`**: Factory function that creates either SSHClient or LocalClient based on config

### Modified Files

#### `src/setup.js`
- **New First Question**: "How will you use this MCP?" with options for Remote or Local mode
- **Dynamic SSH Key Question**: SSH key is only requested if user selects Remote mode
- **Updated Config Storage**: `userIsRemote` boolean now stored in config.json
- **Conditional Testing**: SSH connection test only runs in Remote mode

#### `src/index.js`
- Replaced direct SSHClient instantiation with `createClient(config)` factory call
- Replaced all `sshClient` references with `client` (which can be either SSHClient or LocalClient)
- Both client types expose the same `exec(command)` interface, so all 8 tools work unchanged

### Updated Configuration Structure
Old config.json:
```json
{
  "computingId": "nem2p",
  "sshKeyPath": "/Users/nmagee/.ssh/nem2p_rivanna",
  "hpcHost": "login.hpc.virginia.edu",
  "logging": true,
  "createdAt": "2026-05-06T15:53:26.026Z"
}
```

New config.json (Remote mode):
```json
{
  "computingId": "nem2p",
  "userIsRemote": true,
  "sshKeyPath": "/Users/nmagee/.ssh/nem2p_rivanna",
  "hpcHost": "login.hpc.virginia.edu",
  "logging": true,
  "createdAt": "2026-05-06T15:53:26.026Z"
}
```

New config.json (Local mode):
```json
{
  "computingId": "nem2p",
  "userIsRemote": false,
  "hpcHost": "login.hpc.virginia.edu",
  "logging": true,
  "createdAt": "2026-05-06T15:53:26.026Z"
}
```

## How It Works

### Client Interface
Both SSHClient and LocalClient implement the same interface:
- `async exec(command, timeout = 30000)` - executes a command, returns stdout on success
- `close()` - cleanup method (no-op for LocalClient)

### At Startup (index.js)
1. Load config from `~/.rivanna-mcp/config.json`
2. Call `createClient(config)` which returns:
   - **SSHClient** if `config.userIsRemote === true` (spawns SSH processes)
   - **LocalClient** if `config.userIsRemote === false` (runs bash directly)
3. All 8 tools receive the same client object and call `client.exec(command)`

### Tools Affected
All tools work unchanged:
1. get_job_status
2. get_node_resources
3. get_storage_quota
4. get_directory_usage
5. get_allocation_info
6. get_job_accounting
7. get_cluster_usage_24h
8. submit_job

## User Migration Path

### For Remote Users (existing behavior)
1. Run `rivanna-mcp setup`
2. Select "Remote: Running Claude Code on my local workstation"
3. Provide Computing ID and SSH key path
4. Config will include `"userIsRemote": true` and SSH key path

### For Local Users (new capability)
1. SSH into a Rivanna compute node first
2. Run `rivanna-mcp setup`
3. Select "Local: Already logged into a Rivanna compute node"
4. Provide Computing ID only (SSH key not needed)
5. Config will include `"userIsRemote": false` with no SSH key path

## Benefits
- **Flexibility**: Supports both workstation and HPC-side usage
- **Efficiency**: Local mode avoids SSH overhead when already on HPC
- **Simplicity**: Single client interface means no tool changes needed
- **Security**: SSH key not stored locally when running in local mode
- **Backward Compatible**: Existing configs can be updated with new `userIsRemote` field

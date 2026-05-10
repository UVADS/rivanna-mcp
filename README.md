# Rivanna MCP

An MCP (Model Context Protocol) server for querying Rivanna HPC cluster metrics and job information via SLURM. Integrates seamlessly with Claude Code to give AI access to your cluster status, jobs, resources, and allocations.

Some things you can do with this MCP:

- What are my current jobs in Rivanna?
- Stop my job ID 1234567890.
- How much storage have I used in Rivanna?
- How many cores total are in Rivanna/Afton?
- How many GPUs are available in the cluster?
- Tell me about my allocations.
- Give me the job history for user `mst3k` over the past `N` days.
- Help me submit a job to Rivanna with specific resources.
- Run this command on the cluster: ls -al $HOME/projects
- Show me the 5 largest files in my home directory

## Installation

### Prerequisites

- `node` and `npm` on your system. In Rivanna you can load this as a module.
- An active Rivanna HPC account and allocation.
- **SSH key pair** generated and authorized on Rivanna's login node
- **Network access**: UVA network or VPN connection for remote access
- `git` installed (for GitHub-based installation)
- SSH access enabled if working remotely.

### Install for Your Client

Install globally first:
```bash
npm install -g github:uvads/rivanna-mcp && rivanna-mcp setup
```

Then choose your client below:

#### Claude Code
```bash
claude mcp add rivanna-mcp -- npx -y rivanna-mcp
```

#### Codex
Add to your Codex configuration file (typically `~/.codex/config.json` or via Codex settings):
```json
{
  "mcpServers": {
    "rivanna-mcp": {
      "command": "rivanna-mcp",
      "args": []
    }
  }
}
```

#### Cursor
Add to `.cursor/settings.json` in your project directory:
```json
{
  "mcpServers": {
    "rivanna-mcp": {
      "command": "rivanna-mcp",
      "args": []
    }
  }
}
```

#### Kiro
Add to your Kiro configuration (via Kiro settings or `~/.kiro/config.json`):
```json
{
  "mcpServers": {
    "rivanna-mcp": {
      "command": "rivanna-mcp",
      "args": []
    }
  }
}
```

## Quick Start

### 1. Run Setup Wizard

After installation, configure your Rivanna connection:

```bash
rivanna-mcp setup
```

You'll be prompted for:
- **Computing ID**: Your Rivanna username (e.g., `nem2p`)
- **SSH Key Path**: Path to your SSH private key (e.g., `~/.ssh/nem2p_rivanna`)

The wizard will test the SSH connection and save your configuration to `~/.rivanna-mcp/config.json`.

### 2. Configure Claude Code Integration

You have two options for integrating rivanna-mcp with Claude Code:

#### Option A: Manual Server Management (Simple)

Start the server in a terminal before using Claude Code:

```bash
rivanna-mcp
```

The server will listen for MCP protocol requests from Claude Code. Keep this terminal running while you work.

#### Option B: Automatic Server Management (Recommended)

Configure rivanna-mcp in your project's `.claude/settings.json` to auto-start it:

**For globally installed rivanna-mcp:**

Create or edit `.claude/settings.json` in your project root:

```json
{
  "mcpServers": {
    "rivanna-mcp": {
      "command": "rivanna-mcp",
      "args": []
    }
  }
}
```

**For locally installed rivanna-mcp (in the project):**
```json
{
  "mcpServers": {
    "rivanna-mcp": {
      "command": "node",
      "args": ["/path/to/rivanna-mcp/src/index.js"]
    }
  }
}
```

Replace `/path/to/rivanna-mcp` with the actual path to your rivanna-mcp directory (use absolute paths or `${PROJECT_ROOT}` for relative paths).

**About the `args` field:**
- The `"args": []` should remain empty—rivanna-mcp doesn't accept command-line arguments
- All configuration is read from `~/.rivanna-mcp/config.json` created by the setup wizard
- If you need to reconfigure, just run `rivanna-mcp setup` again

With this configuration, Claude Code will automatically start the MCP server when needed and manage its lifecycle.

### 3. Use in AI Tools

Once configured (either running manually or via settings.json), you'll have access to 10 tools for monitoring and submitting jobs to your Rivanna cluster directly from your IDE queries.

## Available Tools

### `get_job_status`
Query the SLURM job queue with flexible filtering.

**Parameters:**
- `state` (string, optional): Filter by job state: `all`, `RUNNING`, `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED` (default: `all`)
- `user` (string, optional): Filter by username
- `limit` (number, optional): Maximum number of jobs to return (default: 100)

**Example:**
```
get_job_status(state: "RUNNING", limit: 50)
```

### `get_node_resources`
Get available compute nodes and their resource status.

**Parameters:**
- `partition` (string, optional): Filter by partition name (e.g., `gpu`, `standard`)
- `detailed` (boolean, optional): Include detailed per-node information and cluster summary (default: false)

**Example:**
```
get_node_resources(partition: "gpu", detailed: true)
```

### `get_storage_quota`
Check filesystem quotas across all mounted filesystems.

**Parameters:**
- `filesystem` (string, optional): Filter by filesystem path (e.g., `/home`, `/scratch`)

**Example:**
```
get_storage_quota(filesystem: "/home")
```

### `get_directory_usage`
Get disk usage for a specific directory.

**Parameters:**
- `path` (string, optional): Directory path to check (default: current directory)

**Example:**
```
get_directory_usage(path: "/home/nem2p/data")
```

### `get_allocation_info`
View resource allocation limits for users and accounts.

**Parameters:**
- `user` (string, optional): Filter by username

**Example:**
```
get_allocation_info(user: "nem2p")
```

### `get_job_accounting`
Get job accounting and compute hour usage over a time period.

**Parameters:**
- `user` (string, optional): Filter by username
- `days` (number, optional): Number of days to look back (default: 30)

**Example:**
```
get_job_accounting(user: "nem2p", days: 60)
```

### `get_cluster_usage_24h`
Get cluster CPU and memory usage trends for the last 24 hours with colored ASCII graphics.

**Parameters:**
None

**Example:**
```
get_cluster_usage_24h()
```

### `submit_job`
Create and optionally submit a SLURM job file to Rivanna with configurable resources.

**Parameters:**
- `jobName` (string, required): Name for the job (alphanumeric, underscores/hyphens OK)
- `allocation` (string, required): Account/allocation to charge compute hours to
- `partition` (string, required): Partition to submit to (`gpu`, `parallel`, `standard`, `largemem`)
- `cpus` (integer, required): Number of CPU cores to request
- `memory` (string, required): Memory to request (e.g., `"16GB"`, `"32GB"`, `"64GB"`)
- `time` (string, required): Walltime limit in HH:MM:SS format (e.g., `"01:00:00"`)
- `nodes` (integer, optional): Number of compute nodes (default: 1)
- `gpus` (string, optional): Number of GPUs per node (only for gpu partition)
- `outputPath` (string, optional): Path for stdout output file
- `errorPath` (string, optional): Path for stderr output file
- `scriptContent` (string, optional): Shell commands to execute in the job
- `submit` (boolean, optional): Whether to submit immediately (default: false)

**Usage in Claude Code:**

Claude Code can guide you through job creation interactively. Just ask:

```
I want to submit a job to Rivanna that runs my Python script
```

Claude will interview you for the required parameters and can optionally submit the job.

**Example workflow:**
1. Claude asks about your allocation, partition, resource needs
2. You provide answers
3. Claude creates the SLURM script
4. You can review it or let Claude submit it

## Configuration

Configuration is automatically saved to `~/.rivanna-mcp/config.json`:

```json
{
  "computingId": "nem2p",
  "sshKeyPath": "/Users/username/.ssh/nem2p_rivanna",
  "hpcHost": "login.hpc.virginia.edu",
  "createdAt": "2026-05-06T00:00:00.000Z"
}
```

To reconfigure, simply run `rivanna-mcp setup` again or edit the JSON file directly.

### Claude Code Integration

To automatically start rivanna-mcp when using Claude Code, add it to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "rivanna-mcp": {
      "command": "rivanna-mcp",
      "args": []
    }
  }
}
```

Claude Code will now:
- Automatically start the rivanna-mcp server when you begin a session
- Manage the server lifecycle (no manual terminal needed)
- Provide access to all 10 HPC tools in your prompts

**Benefits:**
- One less terminal to manage
- Server starts automatically with your project
- Cleaner workflow within Claude Code

**Requirements:**
- rivanna-mcp must be installed globally (`npm install -g github:uvads/rivanna-mcp`)
- Configuration from `rivanna-mcp setup` must exist at `~/.rivanna-mcp/config.json`

## Architecture

### System Architecture Diagram

See `mcp-architecture.excalidraw` for a detailed visual diagram showing how the components interact:

- **Left**: Your IDE clients (Claude Code, Cursor, Codex, Kiro)
- **Center**: rivanna-mcp MCP server communicating via MCP Protocol
- **Right**: Rivanna HPC cluster with SLURM commands (squeue, sinfo, sbatch, sacct)

To view the diagram:
1. Open [Excalidraw](https://excalidraw.com)
2. Click "Open" and upload `mcp-architecture.excalidraw`

Or export it to PNG/SVG using the Excalidraw CLI or desktop app.

### How It Works

```
Claude Code / Cursor / Codex / Kiro
    ↓ (MCP Protocol)
rivanna-mcp (MCP server)
    ↓ (SSH)
Rivanna Login Node
    ↓ (SLURM commands)
SLURM (squeue, sinfo, sbatch, sacct, etc.)
```

The MCP server:
1. Spawns native SSH processes for each command execution
2. Parses SLURM command output into structured data
3. Returns results via the MCP protocol
4. Supports post-quantum key exchange algorithms for enhanced security

## Development

### Local Setup

```bash
git clone https://github.com/uvads/rivanna-mcp.git
cd rivanna-mcp
npm install
```

### Configuration

Create or edit `~/.rivanna-mcp/config.json` with your credentials:

```bash
mkdir -p ~/.rivanna-mcp
cat > ~/.rivanna-mcp/config.json << 'EOF'
{
  "computingId": "your-username",
  "sshKeyPath": "/path/to/your/ssh/key",
  "hpcHost": "login.hpc.virginia.edu",
  "createdAt": "2026-05-06T00:00:00.000Z"
}
EOF
```

### Run Server

```bash
npm start          # Production mode
npm run dev        # Development mode with auto-reload
```

### Run Setup Wizard

```bash
node src/cli.js setup
```

## Post-Quantum Cryptography

This MCP server attempts to use post-quantum hybrid key exchange algorithms when connecting to Rivanna:

- **Primary**: `sntrup761x25519-sha512@openssh.com` (hybrid post-quantum)
- **Fallback 1**: `curve25519-sha256` (modern, widely supported)
- **Fallback 2**: `diffie-hellman-group14-sha256` (older but compatible)

### Post-Quantum Warning

You may see this warning:

```
** WARNING: connection is not using a post-quantum key exchange algorithm.
** This session may be vulnerable to "store now, decrypt later" attacks.
** The server may need to be upgraded.
```

This indicates Rivanna's SSH server doesn't yet support post-quantum algorithms. The connection still works and is secure for current use, but Rivanna will eventually upgrade to post-quantum support. Your MCP client is already configured for it.

## Troubleshooting

### "Configuration not found"

Run the setup wizard to create your configuration:

```bash
rivanna-mcp setup
```

### "SSH key not found" or "Permission denied"

1. Verify your SSH key exists:
   ```bash
   ls -la ~/.ssh/your-key-name
   ```

2. Ensure it has correct permissions (should be `600`):
   ```bash
   chmod 600 ~/.ssh/your-key-name
   ```

3. Test the connection manually:
   ```bash
   ssh -i ~/.ssh/your-key-name username@login.hpc.virginia.edu whoami
   ```

### Connection timeout

- Verify you're on the UVA network or connected to VPN
- Confirm your SSH key is authorized on Rivanna
- Check Rivanna's status: https://www.rc.virginia.edu
- Try the manual SSH command above to isolate the issue

### SLURM command errors

- Verify your computing ID is correct in the configuration
- Ensure SLURM tools (`squeue`, `sinfo`, etc.) are available on the cluster
- Check your Rivanna account status at the RC website

### Post-Quantum Algorithm Not Available

This is expected if Rivanna hasn't upgraded to support post-quantum algorithms yet. The client will automatically fall back to secure alternatives. No action needed.

## Security Considerations

- **SSH Keys**: Only stored locally in your filesystem
- **Credentials**: Never transmitted outside SSH tunnels
- **Configuration**: Stored locally in `~/.rivanna-mcp/` (not in git)
- **Best Practice**: Use SSH key-based authentication with a strong passphrase

## License

MIT

## Support & Contributions

For issues, feature requests, or contributions:
https://github.com/uvads/rivanna-mcp/issues

## Uninstall

To completely uninstall `rivanna-mcp`:
                                         
1. Uninstall the global npm package:                                                   
    ```
    npm uninstall -g rivanna-mcp
    ```

1. Remove the configuration directory:                    

    ```
    rm -rf ~/.rivanna-mcp                             
    ```

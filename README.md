# Rivanna MCP

An MCP (Model Context Protocol) server for querying Rivanna HPC cluster metrics and job information via SLURM. Integrates seamlessly with Claude Code to give AI access to your cluster status, jobs, resources, and allocations.

## Installation

Install globally from GitHub:

```bash
npm install -g github:uvads/rivanna-mcp
```

Or install locally for development:

```bash
git clone https://github.com/uvads/rivanna-mcp.git
cd rivanna-mcp
npm install
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

### 2. Start the MCP Server

```bash
rivanna-mcp
```

The server will start and listen for MCP protocol requests. When integrated with Claude Code, it automatically manages the connection lifecycle.

### 3. Use in Claude Code

Configure rivanna-mcp in your Claude Code environment to unlock HPC queries. Once connected, you'll have access to 6 tools for monitoring your cluster.

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

## Architecture

```
Claude Code
    ↓
rivanna-mcp (MCP server)
    ↓ SSH
Rivanna Login Node
    ↓
SLURM (squeue, sinfo, sacct, etc.)
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

## Uninstalling

 To completely uninstall rivanna-mcp and test a fresh install:                          
                                         
  1. Uninstall the global npm package:                                                   
  npm uninstall -g rivanna-mcp
                                                                                         
  2. Remove the configuration directory:                    
  rm -rf ~/.rivanna-mcp                                                                  
                                                            
  Then to test a fresh install:

  # Install from GitHub
  npm install -g github:uvads/rivanna-mcp                                                
   
  # Run setup wizard                                                                     
  rivanna-mcp setup                                         

  # Start the server
  rivanna-mcp

  This will give you a completely clean slate. The setup wizard will walk you through    
  entering your credentials and testing the connection.

# rivanna-mcp

An MCP (Model Context Protocol) server for querying Rivanna HPC cluster metrics and job information via SLURM. Integrates seamlessly with Claude Code to give AI access to your cluster status, jobs, resources, and allocations.

## Installation

Install globally from GitHub:

```bash
npm install -g github:uvads/rivanna-mcp
```

## Setup

After installation, run the setup wizard:

```bash
rivanna-mcp setup
```

This will prompt you for:
- **Computing ID**: Your Rivanna username
- **SSH Key Path**: Path to your SSH private key (default: `~/.ssh/id_rsa`)

Configuration is saved to `~/.rivanna-mcp/config.json` and read automatically when the MCP starts.

## Usage with Claude Code

Once set up, the MCP server can be configured in Claude Code to provide tools for querying your Rivanna cluster.

### Available Tools

#### `get_job_status`
Query SLURM job queue. Filter by state, user, and limit results.

**Parameters:**
- `state` (optional): Job state filter - `all`, `RUNNING`, `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`
- `user` (optional): Filter by username
- `limit` (optional, default: 100): Maximum jobs to return

**Example:** Get your running jobs
```
get_job_status(state: "RUNNING", limit: 50)
```

#### `get_node_resources`
Get available compute nodes and their resource status.

**Parameters:**
- `partition` (optional): Filter by partition name
- `detailed` (optional, default: false): Include detailed per-node info and summary

**Example:** Get GPU node availability
```
get_node_resources(partition: "gpu", detailed: true)
```

#### `get_storage_quota`
Check filesystem quotas across mounted filesystems.

**Parameters:**
- `filesystem` (optional): Filter by filesystem path

**Example:** Check home directory quota
```
get_storage_quota(filesystem: "/home")
```

#### `get_directory_usage`
Get disk usage for a specific directory.

**Parameters:**
- `path` (optional, default: current directory): Directory path to check

**Example:** Check data directory size
```
get_directory_usage(path: "/home/nmagee/data")
```

#### `get_allocation_info`
View resource allocation limits for users and accounts.

**Parameters:**
- `user` (optional): Filter by username

**Example:** Check your allocation limits
```
get_allocation_info(user: "nmagee")
```

#### `get_job_accounting`
Get job accounting and compute hour usage over a time period.

**Parameters:**
- `user` (optional): Filter by username
- `days` (optional, default: 30): Number of days to look back

**Example:** Check compute hours used in the last 60 days
```
get_job_accounting(user: "nmagee", days: 60)
```

## Configuration File

Configuration is stored in `~/.rivanna-mcp/config.json`:

```json
{
  "computingId": "nmagee",
  "sshKeyPath": "/Users/nmagee/.ssh/id_rsa",
  "hpcHost": "login.hpc.virginia.edu",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

You can edit this file manually if needed, but `rivanna-mcp setup` is the recommended approach.

## Development

Clone and set up locally:

```bash
git clone https://github.com/uvads/rivanna-mcp.git
cd rivanna-mcp
npm install
npm run dev
```

Run the setup wizard:

```bash
node src/cli.js setup
```

Start the MCP server:

```bash
npm start
```

## How It Works

1. **SSH Connection**: Uses ssh2 library to connect to Rivanna via your configured SSH key
2. **SLURM Commands**: Executes SLURM commands (`squeue`, `sinfo`, `sacct`, etc.) on the cluster
3. **Output Parsing**: Parses cluster output and returns structured data
4. **MCP Protocol**: Exposes results as MCP tools for Claude Code integration

```
Claude Code
    ↓
rivanna-mpc (local MCP server)
    ↓ SSH
Rivanna HPC Cluster (SLURM)
```

## Troubleshooting

### "Configuration not found"
Run `rivanna-mcp setup` to create the configuration file.

### "SSH key not found"
Verify the path to your SSH key is correct. By default, it should be at `~/.ssh/id_rsa`.

### Connection timeout
- Verify you're connected to the network that can reach Rivanna
- Check that your SSH key is authorized on the cluster
- Try connecting manually: `ssh -i /path/to/key username@login.hpc.virginia.edu`

### SLURM command errors
- Verify your computing ID is correct
- Ensure SLURM tools are available on the cluster
- Check cluster status at https://www.rc.virginia.edu

## Security

- SSH key is read from your local filesystem only
- No credentials are transmitted outside SSH connections
- Configuration file is stored locally in `~/.rivanna-mpc/`
- Recommended: Use SSH key-based authentication only (disable password auth)

## License

MIT

## Support

For issues, questions, or contributions, visit:
https://github.com/uvads/rivanna-mcp/issues

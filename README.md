# Rivanna MCP

A local MCP (Model Context Protocol) server for querying Rivanna HPC cluster metrics and job information via SLURM. Integrates seamlessly with your development environment to give AI access to the Rivanna cluster status, your jobs, resources, and allocations.

> **What is MCP?**
> MCP (Model Context Protocol) is an open standard that allows AI assistants to securely access tools and data from external systems. This MCP server acts as a bridge, giving Claude Code and other AI tools direct access to Rivanna cluster commands and information. To learn more about MCP, see [**this video**](https://www.youtube.com/watch?v=pvxNcQTcIy4) from Tim Berglund.

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

## Architecture

### System Architecture Diagram

```mermaid
graph LR
    subgraph LOCAL["🖥️ LOCAL DEVELOPER ENVIRONMENT"]
        Claude["🔧 Claude Code"] -->|MCP Protocol| MCP["⚙️ rivanna-mcp<br/>MCP Server"]
        Cursor["📝 Cursor"] -->|MCP Protocol| MCP
        Codex["📚 Codex"] -->|MCP Protocol| MCP
        Kiro["🎯 Kiro"] -->|MCP Protocol| MCP
    end
    
    MCP -->|SSH Tunnel| Rivanna
    
    subgraph REMOTE["🖲️ REMOTE HPC CLUSTER"]
        Rivanna["Rivanna<br/>Login Node"]
        
        Rivanna -->|squeue| SQueue["📊 Job Status"]
        Rivanna -->|sinfo| SInfo["📊 Node Resources"]
        Rivanna -->|sbatch| SBatch["📊 Job Submission"]
        Rivanna -->|sacct| SAckt["📊 Job Accounting"]
    end
    
    style LOCAL fill:#fef3c7,stroke:#b45309,color:#1e1e1e
    style REMOTE fill:#dbeafe,stroke:#1e40af,color:#1e1e1e
    
    style Claude fill:#fed7aa,stroke:#c2410c,color:#1e1e1e
    style Cursor fill:#fed7aa,stroke:#c2410c,color:#1e1e1e
    style Codex fill:#fed7aa,stroke:#c2410c,color:#1e1e1e
    style Kiro fill:#fed7aa,stroke:#c2410c,color:#1e1e1e
    style MCP fill:#f59e0b,stroke:#92400e,color:#fff
    
    style Rivanna fill:#3b82f6,stroke:#1e3a5f,color:#fff
    style SQueue fill:#93c5fd,stroke:#1e3a5f,color:#1e3a5f
    style SInfo fill:#93c5fd,stroke:#1e3a5f,color:#1e3a5f
    style SBatch fill:#93c5fd,stroke:#1e3a5f,color:#1e3a5f
    style SAckt fill:#93c5fd,stroke:#1e3a5f,color:#1e3a5f
```

**How It Works:**

The MCP server acts as a bridge between your IDE and Rivanna:

1. **IDE Clients** (left): Claude Code, Cursor, Codex, Kiro, etc. connect via MCP Protocol
2. **MCP Server** (center): Receives queries and translates them to SLURM commands
3. **SSH Connection**: Securely tunnels to Rivanna's login node
4. **SLURM Commands**: Executes job queries and submissions on the cluster

The MCP server:
- Spawns native SSH processes for each command execution
- Parses SLURM command output into structured data
- Returns results via the MCP protocol

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

### 1. Run the Setup Wizard

After installation, configure your Rivanna connection:

```bash
rivanna-mcp setup
```

You'll be prompted for:
- **Environment**: Are you working remotely or on a Rivanan compute node?
- **Computing ID**: Your Rivanna username (e.g., `mst3k`).
- **SSH Key Path**: Path to your SSH private key (e.g., `~/.ssh/my_key_rivanna`)
- **Logging**: Would you like your MCP history saved to `~/.rivanna-mcp/history.log`.
- **Default Allocation**: Select your default allocation for SLURM submissions.

The wizard will test your SSH connection and save your configuration to `~/.rivanna-mcp/config.json`.

### 2. Set Your SLURM Defaults (Optional but Recommended)

To streamline job submissions, configure your preferred SLURM parameters (allocation, partition, CPU count, memory, etc.):

```bash
rivanna-mcp slurm-defaults
```

This interactive setup will guide you through:
- **Allocation Account**: Which account to charge compute hours to
- **Partition**: Your preferred queue (standard, gpu, parallel, largemem)
- **CPUs**: Default number of CPU cores
- **Memory**: Default memory allocation
- **Wall-Clock Time**: Default job timeout
- **Nodes/GPUs**: Defaults for parallel or GPU jobs (if applicable)

Your preferences are saved to `~/.rivanna-mcp/slurm-defaults.json` and will be used by:
- **Claude Code**: When using the `submit_job` tool
- **Any other tools**: That reference your SLURM preferences
- **Future CLI commands**: Any other tools you build on top of rivanna-mcp

You can always update your preferences by running the command again.

### 3. Configure in your IDE

You have two options for integrating `rivanna-mcp` with a tool like Claude Code:

#### Option A: Manual Server Management (Simple)

Start the server in a terminal before using Claude Code:

```bash
rivanna-mcp
```

The server will listen for MCP protocol requests from Claude Code. Keep this terminal running separately while you work.

#### Option B: Automatic Server Management (Recommended)

Configure `rivanna-mcp` in your project's `.claude/settings.json` to auto-start it:

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
- The `"args": []` should remain empty. `rivanna-mcp` doesn't accept command-line arguments
- All configuration is read from `~/.rivanna-mcp/config.json` created by the setup wizard
- If you need to reconfigure, just run `rivanna-mcp setup` again

With this configuration, Claude Code will automatically start the MCP server when needed and manage its lifecycle.

Claude Code will now:
- Automatically start the `rivanna-mcp` server when you begin a session
- Manage the server lifecycle (no manual terminal needed)
- Provide access to all HPC tools in your prompts

**Benefits:**
- One less terminal to manage
- Server starts automatically with your project
- Cleaner workflow within Claude Code

### 4. Use in your Development Environment

Once configured (either running manually or via settings.json), you'll have access to HPC tools for monitoring, submitting, and managing jobs on your Rivanna cluster directly from your IDE queries and prompts.

## Available Tools

### `get_cluster_overview`
Get a comprehensive snapshot of the entire Rivanna cluster including capacity usage, GPU availability, node status, and 24-hour trends.

**Parameters:**
None

**Example Prompts:**
- "Give me a full overview of the Rivanna cluster"
- "What's the current state of the cluster?"
- "Show me cluster capacity, GPU types, and 24-hour trends"

### `get_cluster_usage_24h`
Get cluster CPU and memory usage trends for the last 24 hours with colored ASCII graphics.

**Parameters:**
None

**Example Prompts:**
- "What's the cluster utilization looking like?"
- "Show me the cluster usage trends for the last 24 hours"
- "Is the cluster busy right now?"

### `get_node_resources`
Get available compute nodes and their resource status.

**Parameters:**
- `partition` (string, optional): Filter by partition name (e.g., `gpu`, `standard`)
- `detailed` (boolean, optional): Include detailed per-node information and cluster summary (default: false)

**Example Prompts:**
- "How many GPU nodes are available?"
- "Show me detailed resource info for the standard partition"
- "What's the status of compute nodes in the gpu partition?"

### `get_storage_quota`
Check filesystem quotas across all mounted filesystems.

**Parameters:**
- `filesystem` (string, optional): Filter by filesystem path (e.g., `/home`, `/scratch`)

**Example Prompts:**
- "How much storage am I using?"
- "Check my quota on the home filesystem"
- "Show me disk usage across all filesystems"

### `get_directory_usage`
Get disk usage for a specific directory.

**Parameters:**
- `path` (string, optional): Directory path to check (default: current directory)

**Example Prompts:**
- "How much space is my data directory using?"
- "Show me the largest files in my home directory"
- "What's the disk usage in my scratch folder?"

### `get_allocation_info`
View resource allocation limits for users and accounts.

**Parameters:**
- `user` (string, optional): Filter by username

**Example Prompts:**
- "What are my allocation limits?"
- "Tell me about my compute hour budget"
- "Show allocation info for user mst3k"

### `get_job_history`
Get historical job accounting and compute hour usage over a time period.

**Parameters:**
- `user` (string, optional): Filter by username
- `days` (number, optional): Number of days to look back (default: 30)

**Example Prompts:**
- "How many compute hours have I used this month?"
- "Show me my job history for the last 60 days"
- "What's my historical job accounting?"

### `submit_job`
Create and optionally submit a SLURM job file to Rivanna with configurable resources and automatic module loading.

**Default Values (presented for user confirmation):**
- `jobName`: Generated from project folder name + 6 random alphanumeric chars (e.g., `"rivanna-work-1a2b3c"`)
- `partition`: From your saved preferences (set via `rivanna-mcp slurm-defaults`), or `"standard"` if not configured
- `cpus`: From your saved preferences, or `4` if not configured
- `memory`: From your saved preferences, or `"16GB"` if not configured
- `time`: From your saved preferences, or `"01:00:00"` (1 hour) if not configured
- `allocation`: From your saved preferences (required)
- `submit`: `true` (submit immediately)

**Note:** If you haven't configured your SLURM defaults yet, the tool will warn you and suggest running `rivanna-mcp slurm-defaults` to set them up.

**Parameters:**
- `jobName` (string, optional): Name for the job (alphanumeric, underscores/hyphens OK)
- `allocation` (string, optional): Account/allocation to charge compute hours to (uses config default if not provided)
- `partition` (string, optional): Partition to submit to (`gpu`, `parallel`, `standard`, `largemem`)
- `cpus` (integer, optional): Number of CPU cores to request
- `memory` (string, optional): Memory to request (e.g., `"16GB"`, `"32GB"`, `"64GB"`)
- `time` (string, optional): Walltime limit in HH:MM:SS format (e.g., `"01:00:00"`)
- `nodes` (integer, optional): Number of compute nodes (default: 1)
- `gpus` (string, optional): Number of GPUs per node (only for gpu partition)
- `outputPath` (string, optional): Path for stdout output file (default: job directory)
- `errorPath` (string, optional): Path for stderr output file (default: job directory)
- `scriptContent` (string, optional): Shell commands to execute in the job
- `language` (string, optional): Programming environment: `"python"` (miniforge), `"r"` (with goolf), or `"none"` (default: `"python"`)
- `moduleVersion` (string, optional): Specific module version (e.g., `"py310"`, `"py311"` for Python)
- `filesToTransfer` (array, optional): List of local file paths to copy to the job directory (e.g., `["./script.py", "./data.csv"]`)
- `submit` (boolean, optional): Whether to submit immediately (default: true)

**Job Organization:**

Each job submission creates its own directory (`~/rivanna-jobs/jobname_timestamp/`) containing:
- The SLURM script
- Job output and error logs (using SLURM's `%j` for the job ID)
- Any supporting files (keeps `$HOME` clean)

**Auto-Detection of Project Files:**

The tool automatically detects and copies language-specific files from your project:

**Python projects:**
- All Python files (`*.py`) in your current directory
- `Pipfile` or `requirements.txt` if present

**R projects:**
- All R files (`*.R` or `*.r`) in your current directory
- `renv.lock` (R environment snapshot) or `DESCRIPTION` (R package metadata) if present

This keeps your job directory self-contained with all code and dependencies for execution on Rivanna.

**Dependency Management:**

**Python (`language: "python"):**
- If a `Pipfile` exists: Automatically converts it to `requirements.txt` in the job script and installs dependencies via `pip`
- If a `requirements.txt` exists: Automatically copies it and installs dependencies via `pip`

**R (`language: "r"):**
- If `renv.lock` exists: Automatically restores the R environment using `renv::restore()`
- If `DESCRIPTION` exists: Automatically installs package dependencies using `devtools::install_deps()`

Dependencies are installed during job startup, before your job script runs.

**File Transfer:**

Use `filesToTransfer` to upload additional local files (data, configs) to the job directory:
```
"filesToTransfer": ["./input_data.csv", "./config.json"]
```
Files are transferred over SSH to `login.hpc.virginia.edu` and placed in the job directory. In your job script, reference them by filename (e.g., `python my_script.py input_data.csv`).

**Module System:**

The tool automatically loads the appropriate Rivanna modules:
- **Python** (default): Loads `module load miniforge` with Python 3.12 by default. Use `moduleVersion` for other versions (e.g., `"py310"`, `"py311"`)
- **R**: Loads `module load goolf R` (goolf is required as a dependency). Use `module spider R` on Rivanna to discover available R versions
- **None**: Skips module loading for custom environments

**Usage in Claude Code:**

Claude Code can guide you through job creation interactively. Just ask:

```
I want to submit a Python job to Rivanna that processes data
```

Claude will interview you for the required parameters, recommend appropriate modules, and optionally submit the job.

**Example workflow:**
1. Claude asks about your allocation, partition, resource needs, and language preference
2. You provide answers
3. Claude creates the SLURM script with appropriate module loading
4. You can review it or let Claude submit it
5. Your job files are organized in a dedicated directory

### `list_jobs`
Query the SLURM job queue and list all jobs with flexible filtering.

**Parameters:**
- `state` (string, optional): Filter by job state: `all`, `RUNNING`, `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED` (default: `all`)
- `user` (string, optional): Filter by username
- `limit` (number, optional): Maximum number of jobs to return (default: 100)

**Example Prompts:**
- "Show me my running jobs"
- "What jobs have failed?"
- "How many pending jobs do I have?"

### `cancel_job`
Cancel a running or pending SLURM job by ID.

**Parameters:**
- `jobId` (string, required): The SLURM job ID to cancel (get from `list_jobs` tool)
- `signal` (string, optional): Signal to send: `SIGTERM` (graceful, default), `SIGKILL` (force), or other UNIX signal

**Example Prompts:**
- "Cancel job 1234567"
- "Kill job 1234567 with SIGKILL"
- "Stop my running job"

### `ssh_login`
Open an interactive SSH session directly to Rivanna's login node using your configured credentials and SSH key.

**Parameters:**
None

**Example Prompts:**
- "Connect me to Rivanna"
- "Open an SSH session to the login node"
- "Let me SSH into Rivanna"

### `exec_command`
Execute arbitrary shell commands directly on Rivanna and get the output back to your IDE.

**Parameters:**
- `command` (string, required): The shell command to execute (e.g., `"ls -al /home/mst3k/projects/"`)

**Example Prompts:**
- "Run this command on the cluster: `ls -al $HOME/projects`"
- "Show me the 5 largest files in my home directory"
- "Execute: `du -sh /scratch/mst3k/* | sort -h`"

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
   chmod 600 ~/.ssh/your-key-**name**
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

## Security

This MCP server runs locally on your machine. No history or information about your interactions are stored outside of your local environment.

- **SSH Keys**: Only stored locally in your filesystem
- **Credentials**: Never transmitted outside SSH tunnels
- **Configuration**: Stored locally in `~/.rivanna-mcp/` (not in `git`)
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

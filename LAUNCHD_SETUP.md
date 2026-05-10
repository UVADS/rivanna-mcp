# Rivanna MCP Lifecycle Management Setup

This project now includes automatic lifecycle management for the rivanna-mcp server via macOS launchd.

## What's Been Set Up

The following files have been created in `~/.config/launchd/`:

1. **`local.rivanna-mcp.plist`** — LaunchAgent configuration
   - Auto-starts rivanna-mcp on login
   - Auto-restarts if it crashes
   - Manages lifecycle with proper cleanup

2. **`rivanna-mcp-manager.sh`** — Lifecycle manager script
   - Prevents duplicate instances
   - Monitors for activity via log growth
   - Auto-exits after 5 minutes idle
   - Cleans up on shutdown

3. **`rivanna-mcp.sh`** — Management utility
   - Install/uninstall commands
   - Start/stop/restart service
   - View status and logs

4. **`README.md`** — Complete documentation

## Installation

### One-Command Install
```bash
~/.config/launchd/rivanna-mcp.sh install
```

This will automatically set everything up and start the service.

### Verify Installation
```bash
~/.config/launchd/rivanna-mcp.sh status
```

You should see the service running with a PID.

## How It Works

- **On Login:** LaunchAgent auto-loads and starts the manager
- **Manager Role:** 
  - Ensures only one rivanna-mcp instance runs
  - Monitors activity (log file growth)
  - Exits cleanly after 5 minutes with no activity
  - Let's launchd restart it when needed
- **Result:** 
  - No duplicate processes
  - Only running when Claude Code uses it
  - Automatic crash recovery
  - Clean resource management

## Usage

### Common Commands
```bash
# Check service status
~/.config/launchd/rivanna-mcp.sh status

# View manager activity
~/.config/launchd/rivanna-mcp.sh logs

# View server logs
~/.config/launchd/rivanna-mcp.sh mcp-logs

# Restart service
~/.config/launchd/rivanna-mcp.sh restart

# Stop service (temporary)
~/.config/launchd/rivanna-mcp.sh stop

# Remove service permanently
~/.config/launchd/rivanna-mcp.sh uninstall
```

## Log Locations

- Manager logs: `/tmp/rivanna-mcp-manager.log`
- Server logs: `/tmp/rivanna-mcp.log`

View with:
```bash
tail -f /tmp/rivanna-mcp-manager.log
tail -f /tmp/rivanna-mcp.log
```

## After Claude Code Updates

If the rivanna-mcp code is updated:
1. The manager script will automatically pick up the new code on next restart
2. You can force a restart with: `~/.config/launchd/rivanna-mcp.sh restart`

## Troubleshooting

See `~/.config/launchd/README.md` for detailed troubleshooting steps.

Quick checks:
```bash
# See if service is loaded
launchctl list | grep rivanna-mcp

# View errors
tail -20 /tmp/rivanna-mcp-manager-error.log

# Kill stale processes
pkill -9 -f rivanna-mcp
sleep 1
~/.config/launchd/rivanna-mcp.sh restart
```

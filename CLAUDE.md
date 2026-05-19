# rivanna-mcp

MCP server for comprehensive Rivanna HPC cluster management at UVA. Provides tools for job submission/cancellation, real-time job status, compute resource visibility, storage quota monitoring, allocation/billing info, cluster capacity trending, and remote command execution via SSH.

## Stack

- **Runtime:** Node.js with ES modules (`"type": "module"`)
- **Language:** Plain JavaScript (`.js`), not TypeScript
- **Entry:** `src/cli.js` → `src/index.js`
- **Tools:** `src/tools/` — one file per MCP tool
- **Commands:** `src/commands/`
- **HPC scheduler:** SLURM; Rivanna uses Lmod for environment modules

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` prefixes. Scope in parens when useful, e.g. `feat(submit_job): add Rust support`.

## Working rules

- Verify changes work before reporting a task complete
- Edit existing files; do not create new files unless explicitly asked
- Implement exactly what was requested — no unasked-for features or refactors
- Always confirm before `git push`

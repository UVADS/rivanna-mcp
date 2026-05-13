# Roadmap

Items carried forward from the [v1.0.1 release](https://github.com/UVADS/rivanna-mcp/releases/tag/v1.0.1).

- [x] **Smoother SCP/SFTP file transfer** — replace the current SSH-piping workaround with a clean, first-class SCP/SFTP path that handles directories, large files, and resumable transfers without the hangs we hit on Rivanna
- [ ] **Remote environment variable management** — tools to inspect, set, and persist env vars on the cluster (per-session, per-job, or per-user via `~/.bashrc` / `~/.profile`) so jobs run with the right context without manual editing
- [ ] **Declarative `environment.sh` (or `rivanna.yaml`) per project** *(beta ready, not yet complete)* — a single file where the user declares everything a job needs: Lmod modules to load, whether to use miniforge, venv/conda setup, `pip install` targets, R package installs, environment variables, and pre-/post-job hooks. The submitter would consume it and generate a reproducible SLURM script — no more guessing the language wizard's defaults

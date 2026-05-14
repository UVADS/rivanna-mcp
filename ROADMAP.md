# Roadmap

Items carried forward from the [v1.0.1 release](https://github.com/UVADS/rivanna-mcp/releases/tag/v1.0.1).

- [x] **Smoother SCP/SFTP file transfer** — replace the current SSH-piping workaround with a clean, first-class SCP/SFTP path that handles directories, large files, and resumable transfers without the hangs we hit on Rivanna
- [ ] **Remote environment variable management** — tools to inspect, set, and persist env vars on the cluster (per-session, per-job, or per-user via `~/.bashrc` / `~/.profile`) so jobs run with the right context without manual editing
- [ ] **Declarative `environment.sh` (or `rivanna.yaml`) per project** *(beta ready, not yet complete)* — a single file where the user declares everything a job needs: Lmod modules to load, whether to use miniforge, venv/conda setup, `pip install` targets, R package installs, environment variables, and pre-/post-job hooks. The submitter would consume it and generate a reproducible SLURM script — no more guessing the language wizard's defaults

---

## Tier 1 — High value, low effort

These are missing standard SLURM tools — each is under ~50 lines to implement and eliminates the most frequent `exec_command` workarounds.

- [x] **`get_job_details`** (`scontrol show job <id>`) — The most-used HPC command after `squeue`. Returns why a pending job isn't starting (`Reason=ReqNodeNotAvail`, `Priority`, `AssocGrpCPURunMinutesLimit`, etc.), assigned nodes when running, estimated start time, exact resource allocation, and working directory. Without this, diagnosing a stuck job requires `exec_command`.

- [x] **`get_job_efficiency`** (`seff <jobid>`) — After a job completes, reports actual CPU efficiency (%) and memory efficiency (%). Lets the user know "your job requested 16 CPUs but only used 2." Feeds directly into cost optimization and resource right-sizing. Rivanna has `seff` installed.

- [x] **`search_modules`** (`module spider <query>`) — Module discovery is a constant pain point. Users know they need "cuda" but not the exact module string. A structured tool wrapping `module spider` with parsed version lists eliminates most of the "run exec_command to check modules" loop embedded in `submit_job`'s template comments.

- [ ] **`list_partitions`** (`sinfo --summarize`) — There is no clean "what partitions exist, what are their time/CPU/node limits, what's the current queue depth for each?" tool. A partition summary is the first thing a user checks when deciding where to submit a job. Currently gaps between `get_node_resources` (node-level) and `get_cluster_overview` (aggregate).

---

## Tier 2 — Medium effort, high workflow value

- [ ] **Job dependencies in `submit_job`** — SLURM's `--dependency=afterok:<jobid>` is how pipelines are built. Add an optional `dependsOn` field to `rivanna.yaml` (and the tool's override params) to unlock chained job workflows entirely within the MCP, without falling back to `exec_command`.

- [ ] **`get_queue_estimate`** (`squeue --start`) — For pending jobs, SLURM can estimate when they will start. Adding this as a standalone tool (it's a slower query) would let users answer "when will my job run?" without guessing or polling manually.

- [ ] **`hold_job` / `release_job`** (`scontrol hold` / `scontrol release`) — Useful when you've submitted a batch but need to pause one while fixing a data issue. Trivial to implement (same pattern as `cancel_job`), but a real gap in job lifecycle management.

- [ ] **`get_job_output`** — After a job runs, the `.out` and `.err` files sit in the job directory. A tool that knows the `rivanna-jobs/` path convention and returns the last N lines of stdout/stderr would be cleaner and more composable than routing through `exec_command`. Could also stream partial output for running jobs.

---

## Tier 3 — Architectural / intelligence layer

- [ ] **Resource recommendation from job history** — `get_job_history` already returns actual CPU-hours and peak memory per job. A `recommend_resources` tool could scan the last N similar jobs (by name pattern or language type) and suggest `cpus`, `memory`, and `time` values with confidence intervals. Closes the loop between observation and future submission.

- [ ] **SU cost estimation before submission** — Before a job submits, calculate `cpus × nodes × wall_time_hours` and compare against the user's SU balance from `get_allocation_info`. Users can currently over-request and silently drain their allocation. This could live as a preflight check inside `submit_job` or as a standalone `estimate_job_cost` tool.

- [ ] **`watch_job`** — A polling tool that tracks a job until it leaves the queue, then returns the final state and optionally the last lines of output. Supports async workflows: "submit this and tell me when it's done." Configurable poll interval to avoid hammering the scheduler.

---

## Rivanna-specific

- [ ] **Globus integration** — UVA's Rivanna uses Globus for large data transfers. A `globus_transfer` tool (or at minimum a `get_globus_endpoint_info` helper) would address a workflow that nothing in the current SLURM toolset touches — moving datasets to/from the cluster at scale.

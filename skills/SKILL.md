---
name: rivanna
description: >-
  Manage the Rivanna HPC cluster at UVA over SSH: check storage quotas ($HOME and
  $SCRATCH), allocation SU balances, cluster CPU/GPU availability, job status,
  job stdout/stderr, job efficiency and history, list/cancel jobs, search Lmod
  modules, and submit SLURM jobs (simple rivanna.yaml or advanced JOB.slurm).
  Use whenever the user asks about Rivanna, SLURM, sbatch, squeue, allocations,
  SUs, HPC storage/quota, or submitting/checking cluster jobs.

# ── User configuration — EDIT THESE ────────────────────────────────────────
computing_id: <FILL_ME>                     # UVA computing ID (the part before @virginia.edu)
ssh_key_path: <FILL_ME>                     # e.g. ~/.ssh/id_ed25519 — private key for login node
allocation: <FILL_ME>                       # preferred SLURM account, e.g. my_group_alloc
slurm_mode: simple                          # "simple" (rivanna.yaml) or "advanced" (JOB.slurm)
ssh_host: login.hpc.virginia.edu            # Rivanna login node
slurm_jobs_dir: rivanna-jobs                # remote folder (under $HOME) for job dirs
---

# Rivanna HPC management skill

<!--
============================================================================
 SETUP REQUIRED — edit the front matter above before first use
============================================================================
 Two fields are placeholders and MUST be set, or every SSH call will fail:

   ssh_key_path   Absolute or ~-relative path to the PRIVATE key that
                  authenticates to login.hpc.virginia.edu.
                  Example: ~/.ssh/id_mykey
                  The matching public key must already be authorized on
                  Rivanna, and the key must not trigger an interactive
                  password/Duo prompt (key-based auth only).

   allocation     Your default SLURM account (the -A / --account value),
                  used when submitting jobs. Example: my_group_alloc
                  Not sure which accounts you have? Ask this skill to
                  "list my allocations" (§2) and copy the account name.

 The other fields are prefilled and usually need no change:
   computing_id (nmagee), ssh_host, slurm_mode (simple|advanced),
   slurm_jobs_dir.
============================================================================
-->

This skill emulates the `rivanna-mcp` MCP server using plain SSH commands run
through the **Bash** tool. It manages jobs, storage, allocations, and cluster
capacity on UVA's Rivanna cluster.

> **Before first use:** set `ssh_key_path` and `allocation` in the front matter
> above (both are `<FILL_ME>`). See the comment block above for details.

## How the transport works

Every non-interactive operation runs a command on the login node over SSH.
Read the config values from this file's front matter and substitute them:

```
ssh -i {ssh_key_path} {computing_id}@{ssh_host} '<REMOTE COMMAND>'
```

File transfer (for job submission) uses `scp`:

```
scp -i {ssh_key_path} <local_file> {computing_id}@{ssh_host}:<remote_dir>/
```

**Assumptions & guardrails**
- Assumes an SSH client is available on the localhost, callable as `ssh`.
- Key-based auth to the login node is already configured (no interactive Duo/2FA
  prompt for the key). If SSH prompts for a password or MFA, tell the user to
  set up an SSH key and stop.
- Always single-quote the remote command so the local shell doesn't expand
  `$HOME`, `$USER`, etc. — those must expand on Rivanna.
- Batch related lookups where possible, but keep each `ssh` call to one logical
  operation so failures are easy to attribute.
- Never fabricate output. If a command errors or returns nothing, report that.

If the user just wants an **interactive shell** (the old `ssh_login` tool), tell
them to run this themselves in the session prompt:
`! ssh -i {ssh_key_path} {computing_id}@{ssh_host}`

---

## 1. Storage quota — $HOME and $SCRATCH  (get_storage_quota)

Run:
```
ssh -i {key} {id}@{host} 'hdquota -s 2>/dev/null'
```

`hdquota -s` prints columns separated by 2+ spaces, e.g.:
```
Storage Type     Location          Size        Used       Avail    Use%
Home Directory   /home/nem2p       200.0 GB    28.9 GB    171.1 GB  14%
```
Parse each data row by splitting on runs of **2+ spaces** (keeps "200.0 GB" and
"Home Directory" intact). Skip the header row (last field is not `NN%`).

Report per filesystem: **name, path, quota, used, available, %used**. Map rows:
- label contains "home" → **Home Storage (GPFS)**, path `/home/{id}` if blank.
  Baseline quota **200 GB**.
- label contains "scratch" or "weka" → **Scratch Storage (Weka)**, path
  `/sfs/weka/scratch/{id}` if blank. Baseline quota **10 TB**.

Because `hdquota` sometimes misreports the limit column, compute `%used` against
these baselines: `used_bytes / baseline_bytes * 100`.

**Directory usage** (get_directory_usage) — size of one path:
```
ssh -i {key} {id}@{host} 'du -sh <PATH>'
```

---

## 2. Allocation SU balances  (get_allocation_info)

Two commands. First the associations:
```
ssh -i {key} {id}@{host} 'sacctmgr show assoc user={id} format=cluster,account,user,maxcpus,maxnode,maxwall,grpcpumins -p'
```
`-p` gives `|`-delimited fields: cluster, account, user, maxcpus, maxnode,
maxwall, grpcpumins. Skip the header line starting with `Cluster`.

Then SU balances:
```
ssh -i {key} {id}@{host} '/opt/mam/9.1.2/bin/mam-balance'
```
`mam-balance` is whitespace-columnar with a header (Id, Name, Balance, Reserved,
Effective, CreditLimit, Available). Match each account by **Name** to the
associations above and merge in **Balance / Reserved / Available** SUs. If
`mam-balance` isn't found, still report associations without SU numbers.

Present a table of **account → available SUs / balance / reserved**, one row per
allocation the user belongs to.

---

## 3. Cluster CPU & GPU availability  (get_node_resources / get_cluster_usage_24h)

**Quick per-node view** (get_node_resources):
```
ssh -i {key} {id}@{host} 'sinfo --all --Node --format="%N %t %c %m %f" --noheader'
```
Columns: nodename, state (`idle`/`alloc`/`mix`/`down`/…), cpus, memory(MB),
features. Aggregate a **state count** (how many nodes idle vs allocated vs down).
For a single partition add `--partition=<name>`.

**Free-vs-used CPUs & GPUs** (get_cluster_usage_24h) — the richer view:
```
ssh -i {key} {id}@{host} 'scontrol show nodes all'
```
Parse each `NodeName=` block for `CPUTot=`, `RealMemory=`, `State=`,
`Partitions=`, `Features=`. Then:
- **CPUs:** sum `CPUTot` per partition = total; nodes in `alloc`/`mix` are in use,
  `idle` are free. (For exact free cores use `CPUAlloc=` vs `CPUTot=` per node.)
- **GPUs:** infer type from `Features=` substrings — `v100`→V100,
  `a100_80gb`→A100-80GB, `a100_40gb`→A100-40GB, `a40`→A40, `a6000`→A6000,
  `h200`→H200, `rtx3090`/`rtx2080`. Count idle vs allocated GPU nodes per type.

Report **total CPUs, free/allocated CPUs, and GPU nodes free/allocated by type**,
broken down by partition (`standard`, `gpu`, `parallel`, `largemem`, …).

For a combined health summary (get_cluster_overview), run both of the above and
present: total nodes, node-state breakdown, per-partition CPU/GPU utilization,
most/least utilized partition.

---

## 4. Job status by ID  (get_job_details)

```
ssh -i {key} {id}@{host} 'scontrol show job <JOBID>'
```
Output is space-separated `key=value` pairs. Extract and report:
`JobId, JobName, JobState, Reason` (why pending: Priority/Resources/…),
`UserId, Account, Partition, NumNodes, NumCPUs, TimeLimit, RunTime, SubmitTime,
StartTime, EndTime, NodeList, WorkDir, StdOut, StdErr, Command, ExitCode,
Priority, QOS`. Memory is inside `TRES=` (`mem=…`).

If the command errors with "Invalid job id" / "not found", the job likely
completed and was purged — say so and suggest `sacct` (job history, §9) instead.

**Live queue view of ALL your jobs** (list_jobs):
```
ssh -i {key} {id}@{host} "squeue --user={id} --format='%i|%j|%S|%T|%M|%C'"
```
Columns: job_id, name, start_time, state, elapsed, cpus. First line is the
header — skip it. Add `--states=RUNNING` (etc.) to filter.

---

## 5. Job stdout / stderr by ID  (composed: job details → read files)

There is no single command for this — it's two steps, exactly as the MCP does it:

1. Get the output paths from the scheduler:
   ```
   ssh -i {key} {id}@{host} 'scontrol show job <JOBID>'
   ```
   Read `StdOut=` and `StdErr=` from the output.
   - If the job is already gone from `scontrol`, get paths from history:
     `sacct -j <JOBID> --format=JobID,WorkDir,StdOut,StdErr%200 -p` (or check the
     job's `WorkDir` — the MCP writes `<jobdir>/%j.out` and `<jobdir>/%j.err`).
2. Read the files (use `tail` for long logs):
   ```
   ssh -i {key} {id}@{host} 'cat <STDOUT_PATH>'
   ssh -i {key} {id}@{host} 'cat <STDERR_PATH>'
   ```
   For large/running jobs prefer `tail -n 100 <path>`.

Show the user both streams, labeled clearly. If a path doesn't exist yet, the
job hasn't started writing output — say so.

---

## 6. Submit a SLURM job  (submit_job)

Behavior depends on `slurm_mode` in the front matter. **Both modes enforce a
review gate: generate the file, show it to the user, and only run `sbatch` after
the user explicitly approves.** Never submit un-reviewed.

### Resolution order for job parameters
`explicit user request` > `values in rivanna.yaml / JOB.slurm` > built-in
defaults: partition `standard`, cpus `4`, memory `16GB`, time `01:00:00`,
nodes `1`, gpus none. Account defaults to the front-matter `allocation`; if it's
still `<FILL_ME>` or `changeme`, stop and ask (offer to run §2 to list accounts).

### Shared submission steps (after the file is approved)
1. Resolve the remote job dir:
   ```
   ssh -i {key} {id}@{host} 'echo $HOME'
   ```
   → `jobDir = $HOME/{slurm_jobs_dir}/<jobname>_<timestamp>`. Create it:
   `ssh ... 'mkdir -p <jobDir>'`.
2. `scp` any input files the job needs into `<jobDir>/`.
3. Write the `.slurm` script into `<jobDir>` (heredoc), `chmod +x` it. Use
   `#SBATCH --chdir=<jobDir>`, `--output=<jobDir>/%j.out`, `--error=<jobDir>/%j.err`.
4. Submit: `ssh ... 'sbatch <jobDir>/<name>.slurm'` and parse
   `Submitted batch job <ID>` → report the job ID. Then §4 tracks it.

### Simple mode → `rivanna.yaml`
If `rivanna.yaml` is absent in the working dir, **generate a template** and show
it for review (do not submit). Detect the project language from files present
(.py→python/miniforge, .R→R/goolf, .go, .c/.cpp→gcc, .jl, Cargo.toml→rust,
.f90→fortran, .m→matlab, .java, .nf→nextflow, Snakefile→snakemake, .pl→perl)
and tailor the `modules` / `env_setup` / `commands` sections. Template shape:

```yaml
job:
  name: <dir-name>
  account: {allocation}      # required
  partition: standard        # standard | gpu | parallel | largemem
  nodes: 1
  cpus: 4
  memory: 16GB
  time: "01:00:00"
  # gpus: 1                  # uncomment for GPU jobs; also set partition: gpu
modules:
  - miniforge                # example (python) — use §7 to find exact versions
env_setup:
  - pip install -r requirements.txt
commands:
  - echo "Job started on $(hostname) at $(date)"
  - python your_script.py
files:
  - ./your_script.py
```
When approved, assemble the `.slurm` script from these sections in order:
`#SBATCH` header → `module load` lines → env_setup lines → command lines. The
`files:` list (plus any extra files) is `scp`'d to the job dir.

### Advanced mode → `JOB.slurm`
If no `JOB.slurm` exists, write a starter template with `#SBATCH` directives and
commented Modules / Environment / Commands sections, and show it for review:

```bash
#!/bin/bash
#SBATCH --job-name=<name>
#SBATCH --account={allocation}
#SBATCH --partition=standard
#SBATCH --nodes=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16GB
#SBATCH --time=01:00:00
#SBATCH --chdir=<jobDir>
#SBATCH --output=<jobDir>/%j.out
#SBATCH --error=<jobDir>/%j.err
# #SBATCH --gpus-per-node=1   # uncomment for GPU; also set partition=gpu

# --- Modules ---
# module load miniforge

# --- Environment setup ---
# source activate myenv

# --- Job commands ---
echo "Job started on $(hostname) at $(date)"
# python your_script.py
echo "Job finished at $(date)"
```
The user edits this file directly (full control over raw SLURM). When approved,
`scp`/write it to `<jobDir>` and `sbatch` as in the shared steps.

---

## 7. Search Lmod modules  (search_modules)

```
ssh -i {key} {id}@{host} 'bash -l -c "module --terse spider <QUERY> 2>&1"'
```
`module` is a shell function, so a **login shell** (`bash -l -c`) is required to
source Lmod. The module list comes on **stderr**, hence `2>&1`. `--terse` prints
one `name/version` per line. Group by module name and list available versions.
If output says "Unable to find", report no matches (not an error).

Use this to fill in exact `modules:` versions for rivanna.yaml / JOB.slurm.

---

## 8. Cancel a job  (cancel_job)

```
ssh -i {key} {id}@{host} 'scancel <JOBID>'
```
Add `--signal=<SIG>` before the job ID to send a specific signal (default
SIGTERM). "Invalid job id specified" means it already finished/was cancelled —
report that rather than treating it as a hard failure. Confirm with the user
before cancelling unless they clearly asked to.

---

## 9. Job efficiency & history

**Efficiency** (get_job_efficiency) — for a completed job:
```
ssh -i {key} {id}@{host} 'seff <JOBID>'
```
Parse the `Key: Value` lines: State, Cores, CPU Utilized, CPU Efficiency,
Job Wall-clock time, Memory Utilized, Memory Efficiency. If State is
RUNNING/PENDING, warn that the percentages are partial, not final.

**History** (get_job_history) — past jobs + CPU-hours over N days (default 30):
```
ssh -i {key} {id}@{host} 'sacct --user={id} --format=jobid,jobname,user,account,state,start,elapsed,cputimeraw,maxvmsize --noheader --start=<YYYY-MM-DD>'
```
Compute `<YYYY-MM-DD>` as today minus N days. CPU-hours per job =
`cputimeraw / 3600`. Report per-job rows plus a total CPU-hours sum.

---

## 10. Arbitrary command  (exec_command)

Escape hatch for anything not covered above:
```
ssh -i {key} {id}@{host} '<any command>'
```
Report stdout/stderr faithfully. Do not run destructive commands (`rm -rf`,
quota-filling writes, etc.) without explicit user confirmation.

---

## Quick reference

| Ask | Section | Core command |
|-----|---------|--------------|
| Storage quota | §1 | `hdquota -s` |
| Dir size | §1 | `du -sh <path>` |
| Allocations / SUs | §2 | `sacctmgr show assoc` + `mam-balance` |
| Free/used CPUs & GPUs | §3 | `scontrol show nodes all`, `sinfo` |
| Job status | §4 | `scontrol show job <id>` |
| My jobs (queue) | §4 | `squeue --user={id}` |
| Job stdout/stderr | §5 | job details → `cat`/`tail` StdOut/StdErr |
| Submit job | §6 | `rivanna.yaml` or `JOB.slurm` → `sbatch` |
| Find modules | §7 | `module --terse spider <q>` |
| Cancel job | §8 | `scancel <id>` |
| Job efficiency | §9 | `seff <id>` |
| Job history | §9 | `sacct --start=<date>` |
| Anything else | §10 | raw ssh command |

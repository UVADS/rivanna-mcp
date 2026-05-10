import { expandNodeRanges, parseLineDelimited, shellQuote } from '../utils.js';

export async function getNodeResources(sshClient, options = {}) {
  const { partition, detailed = false } = options;

  // Use sinfo with --Node flag to list each node individually (avoids compression)
  let command = 'sinfo --all --Node --format="%N %t %c %m %f" --noheader';

  if (partition) {
    command = `sinfo --partition=${shellQuote(partition)} --Node --format="%N %t %c %m %f" --noheader`;
  }

  const output = await sshClient.exec(command);
  const lines = parseLineDelimited(output);

  const nodes = [];

  lines.forEach((line) => {
    const parts = line.split(/\s+/);
    if (parts.length < 5) return; // Skip malformed lines

    const nodeName = parts[0];
    const state = parts[1];
    const cpus = parts[2];
    const memory = parts[3];
    const features = parts[4] || '';

    // Expand compressed node names if present
    const expandedNames = expandNodeRanges(nodeName);

    expandedNames.forEach((name) => {
      nodes.push({
        nodename: name,
        state,
        cpus,
        memory,
        diskfree: '0',
        features,
      });
    });
  });

  const stateCount = nodes.reduce(
    (acc, node) => {
      acc[node.state] = (acc[node.state] || 0) + 1;
      return acc;
    },
    {}
  );

  if (detailed) {
    // Get aggregate summary using scontrol to verify total counts
    const scontrolSummary = await sshClient.exec('scontrol show config | grep NodeCount');

    // Get state summary
    const stateCmd = 'sinfo --all --summarize --format="%10t %10N"';
    const stateSummary = await sshClient.exec(stateCmd);

    return {
      success: true,
      nodeCount: nodes.length,
      stateCount,
      nodes,
      summary: {
        scontrolVerification: scontrolSummary.trim(),
        stateSummary: stateSummary.trim(),
      },
    };
  }

  return {
    success: true,
    nodeCount: nodes.length,
    stateCount,
    nodes,
  };
}

export const nodeResourcesTool = {
  name: 'get_node_resources',
  description:
    'Get detailed inventory of compute nodes on Rivanna including their state, CPU count, memory, and feature tags. Returns per-node information: node name (compute-0-0, gpu-0-1, etc.), current state (idle, allocated, down, drained), CPU cores available, memory capacity, and hardware features (GPU types, processor generation, interconnect type). Use this to: (1) identify available resources before submitting jobs with submit_job, (2) determine which nodes have GPUs or specific hardware features, (3) understand why jobs are stuck (check if matching nodes are down/drained), (4) plan job parameters (CPU count, memory) based on node specifications, (5) diagnose performance issues by checking node state and features. Supports filtering by partition (standard/parallel/gpu/largemem) to narrow down results. Optional detailed mode includes scontrol verification and state summaries for cluster-wide insights.',
  inputSchema: {
    type: 'object',
    properties: {
      partition: {
        type: 'string',
        description:
          'Filter nodes to a specific SLURM partition: "standard" for CPU-only jobs, "gpu" for GPU jobs, "parallel" for large multi-node jobs, "largemem" for high-memory jobs, etc. Omit to see nodes from all partitions.',
      },
      detailed: {
        type: 'boolean',
        description:
          'Include detailed cluster-wide summary with node count verification and state breakdown across all partitions. Adds scontrol verification output and partition state summary to results.',
        default: false,
      },
    },
  },
};

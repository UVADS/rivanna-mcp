import { parseSinfoOutput, expandNodeRanges } from '../utils.js';

export async function getNodeResources(sshClient, options = {}) {
  const { partition, detailed = false } = options;

  // Use -N flag to force one node per line and --all to get all nodes including hidden ones
  let command = 'sinfo -N --all --format="%20N %10t %6c %10m %d %50f" --noheader';

  if (partition) {
    command += ` --partition=${partition}`;
  }

  const output = await sshClient.exec(command);
  const lines = output.trim().split('\n');

  const nodes = lines
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const parts = line.split(/\s+/);
      const nodeSpec = parts[0];
      // Expand SLURM compressed node ranges (e.g., node[0-2] => node0, node1, node2)
      const expandedNames = expandNodeRanges(nodeSpec);

      return expandedNames.map((nodename) => ({
        nodename,
        state: parts[1],
        cpus: parts[2],
        memory: parts[3],
        diskfree: parts[4],
        features: parts.slice(5).join(' '),
      }));
    });

  if (detailed) {
    // Get aggregate summary using scontrol to verify total counts
    const scontrolSummary = await sshClient.exec('scontrol show config | grep NodeCount');

    // Get state summary
    const stateCmd = 'sinfo --all --summarize --format="%10t %10N"';
    const stateSummary = await sshClient.exec(stateCmd);

    return {
      success: true,
      nodeCount: nodes.length,
      nodes,
      summary: {
        scontrolVerification: scontrolSummary.trim(),
        stateSummary: stateSummary.trim(),
      },
    };
  }

  const stateCount = nodes.reduce(
    (acc, node) => {
      acc[node.state] = (acc[node.state] || 0) + 1;
      return acc;
    },
    {}
  );

  return {
    success: true,
    nodeCount: nodes.length,
    stateCount,
    nodes,
  };
}

export const nodeResourcesTool = {
  name: 'get_node_resources',
  description: 'Get available compute nodes, their state, and resource availability.',
  inputSchema: {
    type: 'object',
    properties: {
      partition: {
        type: 'string',
        description: 'Filter by partition name (optional)',
      },
      detailed: {
        type: 'boolean',
        description: 'Include detailed per-node information and cluster summary',
        default: false,
      },
    },
  },
};

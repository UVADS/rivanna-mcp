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

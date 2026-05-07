import { parseSinfoOutput, expandNodeRanges } from '../utils.js';

export async function getNodeResources(sshClient, options = {}) {
  const { partition, detailed = false } = options;

  // Use scontrol to get individual node info - more reliable than sinfo for large clusters
  let command = 'scontrol show nodes all';

  if (partition) {
    command = `scontrol show nodes all | grep -A 20 "Partitions=${partition}"`;
  }

  const output = await sshClient.exec(command);
  const nodeBlocks = output.split('NodeName=').filter((block) => block.trim().length > 0);

  const nodes = nodeBlocks.map((block) => {
    const lines = block.split('\n');
    const nodeLine = lines[0];
    const nodename = nodeLine.split(/\s+/)[0];

    // Extract fields from the block
    let state = 'unknown';
    let cpus = '0';
    let memory = '0';
    let features = '';

    lines.forEach((line) => {
      if (line.includes('State=')) {
        state = line.match(/State=([^\s,]+)/)?.[1] || state;
      }
      if (line.includes('CPUTot=')) {
        cpus = line.match(/CPUTot=(\d+)/)?.[1] || cpus;
      }
      if (line.includes('RealMemory=')) {
        memory = line.match(/RealMemory=(\d+)/)?.[1] || memory;
      }
      if (line.includes('Features=')) {
        features = line.match(/Features=([^\s]*)/)?.[1] || features;
      }
    });

    return {
      nodename,
      state,
      cpus,
      memory,
      diskfree: '0',
      features,
    };
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

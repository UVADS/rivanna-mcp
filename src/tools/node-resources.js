import { parseSinfoOutput } from '../utils.js';

export async function getNodeResources(sshClient, options = {}) {
  const { partition, detailed = false } = options;

  let command = 'sinfo --format="%20N %10t %6c %10m %d %50f" --noheader';

  if (partition) {
    command += ` --partition=${partition}`;
  }

  const output = await sshClient.exec(command);
  const lines = output.trim().split('\n');

  const nodes = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        nodename: parts[0],
        state: parts[1],
        cpus: parts[2],
        memory: parts[3],
        diskfree: parts[4],
        features: parts.slice(5).join(' '),
      };
    });

  if (detailed) {
    const clusterInfo = await sshClient.exec(
      'sinfo --summarize --format="%20N %10t %6c %10m"'
    );
    const summary = clusterInfo
      .trim()
      .split('\n')
      .reduce((acc, line) => {
        if (line.includes('allocated')) acc.allocated = line;
        if (line.includes('idle')) acc.idle = line;
        if (line.includes('down')) acc.down = line;
        return acc;
      }, {});

    return {
      success: true,
      nodeCount: nodes.length,
      nodes,
      summary,
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

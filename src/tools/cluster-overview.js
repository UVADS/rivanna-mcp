import { getNodeResources } from './node-resources.js';
import { getClusterUsage24h } from './usage-trends.js';

export async function getClusterOverview(sshClient, options = {}) {
  try {
    // Get both node resources and usage data
    const [nodeData, usageData] = await Promise.all([
      getNodeResources(sshClient, { detailed: true }),
      getClusterUsage24h(sshClient, options),
    ]);

    // Build comprehensive overview
    const overview = {
      success: true,
      timestamp: new Date().toISOString(),
      summary: buildSummary(nodeData, usageData),
      graphs: {
        capacityComparison: usageData.graphs.capacityComparison,
        gpuComparison: usageData.graphs.gpuComparison,
        cpuTrend: usageData.graphs.cpuTrend,
        memTrend: usageData.graphs.memTrend,
      },
      details: {
        totalNodes: nodeData.nodeCount,
        nodeStateBreakdown: nodeData.stateCount,
        partitionStats: usageData.partitionStats,
        usageSummary: usageData.summary,
        capacity: usageData.capacity,
      },
    };

    return overview;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

function buildSummary(nodeData, usageData) {
  const totalCpus = usageData.capacity.totalCpus;
  const totalMemGb = usageData.capacity.totalMemoryGb;
  const peakCpuPercent = usageData.summary.peakCpuPercent;
  const avgCpuPercent = usageData.summary.avgCpuPercent;

  // Calculate partition utilization
  const partitionMetrics = Object.entries(usageData.partitionStats).map(([name, stats]) => {
    const totalNodes = stats.nodes.idle + stats.nodes.allocated + stats.nodes.down + stats.nodes.other;
    return {
      partition: name,
      allocatedNodes: stats.nodes.allocated,
      totalNodes,
      utilizationPercent: stats.avgCpuPercent,
    };
  });

  // Get most and least utilized partitions
  const sorted = [...partitionMetrics].sort((a, b) => parseFloat(b.utilizationPercent) - parseFloat(a.utilizationPercent));
  const mostUtilized = sorted[0];
  const leastUtilized = sorted[sorted.length - 1];

  return {
    clusterHealth: {
      totalNodes: nodeData.nodeCount,
      totalCpus,
      totalMemoryGb: totalMemGb,
      nodeStatus: nodeData.stateCount,
    },
    utilization: {
      peakCpuPercent: parseFloat(peakCpuPercent),
      avgCpuPercent: parseFloat(avgCpuPercent),
      peakMemPercent: usageData.summary.peakMemPercent,
      avgMemPercent: usageData.summary.avgMemPercent,
    },
    partitionHighlights: {
      mostUtilized: {
        partition: mostUtilized.partition,
        utilizationPercent: mostUtilized.utilizationPercent,
        nodesUsed: `${mostUtilized.allocatedNodes}/${mostUtilized.totalNodes}`,
      },
      leastUtilized: {
        partition: leastUtilized.partition,
        utilizationPercent: leastUtilized.utilizationPercent,
        nodesUsed: `${leastUtilized.allocatedNodes}/${leastUtilized.totalNodes}`,
      },
    },
    jobActivity: {
      totalJobsLast24h: usageData.summary.totalJobs,
      peakCpuUsage: usageData.summary.peakCpuUsage,
      peakMemUsage: usageData.summary.peakMemUsage,
    },
  };
}

export const clusterOverviewTool = {
  name: 'get_cluster_overview',
  description:
    'Get a comprehensive high-level summary of Rivanna cluster status, capacity, and recent activity in the last 24 hours. Combines node inventory, resource utilization trends, and partition health into a single view. Returns: total cluster capacity (CPUs, memory, nodes), current node states (idle/allocated/down), per-partition utilization percentages, GPU node availability, peak and average CPU/memory usage over 24 hours, most/least congested partitions, and color-coded visual graphs. Use this for: (1) executive summary of cluster status before starting work, (2) quick check if cluster is overloaded (high utilization may mean long queues), (3) identify underutilized partitions that might run jobs faster, (4) see GPU availability at a glance, (5) decide job submission strategy. Drill down with get_cluster_usage_24h, get_node_resources, or list_jobs.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

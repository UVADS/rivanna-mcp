export async function getClusterUsage24h(sshClient, options = {}) {
  // Get current node info by partition
  const sinfoOutput = await sshClient.exec(
    'sinfo --format="%20N %15P %6t %6c %10m" --noheader'
  );

  const nodesByPartition = {};
  const capacityByPartition = {};

  sinfoOutput
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .forEach((line) => {
      const parts = line.split(/\s+/);
      const partition = parts[1];
      const state = parts[2];
      const cpus = parseInt(parts[3], 10);
      const memory = parseInt(parts[4], 10);

      if (!nodesByPartition[partition]) {
        nodesByPartition[partition] = {
          idle: 0,
          allocated: 0,
          down: 0,
          other: 0,
        };
        capacityByPartition[partition] = { totalCpus: 0, totalMemGb: 0 };
      }

      capacityByPartition[partition].totalCpus += cpus;
      capacityByPartition[partition].totalMemGb += memory;

      if (state.includes('idle')) {
        nodesByPartition[partition].idle++;
      } else if (state.includes('alloc')) {
        nodesByPartition[partition].allocated++;
      } else if (state.includes('down')) {
        nodesByPartition[partition].down++;
      } else {
        nodesByPartition[partition].other++;
      }
    });

  // Get job accounting for last 24 hours with per-partition data
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1);
  const dateStr = startDate.toISOString().split('T')[0];

  const sacctCmd = `sacct --format=jobid,partition,start,end,alloccpus,maxvmsize,state --noheader --start=${dateStr} --allocations`;
  const sacctOutput = await sshClient.exec(sacctCmd);

  const jobs = sacctOutput
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        jobid: parts[0],
        partition: parts[1],
        start: new Date(parts[2]),
        end: new Date(parts[3]),
        cpus: parseInt(parts[4], 10) || 0,
        memory: parseInt(parts[5], 10) || 0,
        state: parts[6],
      };
    })
    .filter((job) => job.start && job.end && !isNaN(job.start.getTime()));

  // Create 24 hourly buckets
  const now = new Date();
  const buckets = [];
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    buckets.push({
      hour: i,
      time: time.toISOString().slice(11, 13),
      cpuUsage: 0,
      memUsage: 0,
      jobCount: 0,
    });
  }

  // Aggregate job data into buckets
  jobs.forEach((job) => {
    for (let i = 0; i < buckets.length - 1; i++) {
      const bucketStart = new Date(now.getTime() - (23 - i + 1) * 60 * 60 * 1000);
      const bucketEnd = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);

      if (job.start < bucketEnd && job.end > bucketStart) {
        buckets[i].cpuUsage += job.cpus;
        buckets[i].memUsage += job.memory;
        buckets[i].jobCount += 1;
      }
    }
  });

  // Calculate total capacity
  const totalCpuCapacity = Object.values(capacityByPartition).reduce(
    (sum, p) => sum + p.totalCpus,
    0
  );
  const totalMemCapacity = Object.values(capacityByPartition).reduce(
    (sum, p) => sum + p.totalMemGb,
    0
  );

  // Add utilization percentages to buckets
  buckets.forEach((bucket) => {
    bucket.cpuPercent = ((bucket.cpuUsage / totalCpuCapacity) * 100).toFixed(1);
    bucket.memPercent = ((bucket.memUsage / totalMemCapacity) * 100).toFixed(1);
  });

  // Generate improved graphs
  const graphs = {
    cpuTrend: generateTrendGraph(buckets, 'cpuPercent', 'CPU Utilization %'),
    memTrend: generateTrendGraph(buckets, 'memPercent', 'Memory Utilization %'),
    partitionSummary: generatePartitionSummary(
      nodesByPartition,
      capacityByPartition,
      jobs
    ),
  };

  // Calculate per-partition stats
  const partitionStats = {};
  Object.keys(nodesByPartition).forEach((partition) => {
    const partitionJobs = jobs.filter((j) => j.partition === partition);
    const totalCpus = partitionJobs.reduce((sum, j) => sum + j.cpus, 0);
    const totalMem = partitionJobs.reduce((sum, j) => sum + j.memory, 0);
    const capacity = capacityByPartition[partition];

    partitionStats[partition] = {
      nodes: nodesByPartition[partition],
      capacity,
      jobCount: partitionJobs.length,
      totalCpuAlloc: totalCpus,
      totalMemAlloc: totalMem,
      avgCpuPercent: (
        (totalCpus / capacity.totalCpus) *
        100
      ).toFixed(1),
      avgMemPercent: (
        (totalMem / capacity.totalMemGb) *
        100
      ).toFixed(1),
    };
  });

  return {
    success: true,
    period: '24 hours',
    timestamp: new Date().toISOString(),
    capacity: {
      totalCpus: totalCpuCapacity,
      totalMemoryGb: totalMemCapacity,
    },
    summary: {
      totalJobs: jobs.length,
      peakCpuUsage: Math.max(...buckets.map((b) => b.cpuUsage)),
      peakCpuPercent: Math.max(...buckets.map((b) => parseFloat(b.cpuPercent))),
      avgCpuPercent: (
        buckets.reduce((sum, b) => sum + parseFloat(b.cpuPercent), 0) /
        buckets.length
      ).toFixed(1),
      peakMemUsage: Math.max(...buckets.map((b) => b.memUsage)),
      peakMemPercent: Math.max(...buckets.map((b) => parseFloat(b.memPercent))),
      avgMemPercent: (
        buckets.reduce((sum, b) => sum + parseFloat(b.memPercent), 0) /
        buckets.length
      ).toFixed(1),
    },
    partitionStats,
    buckets,
    graphs,
  };
}

function generateTrendGraph(buckets, field, label) {
  const height = 8;

  let graph = `\n┌─ ${label}\n`;

  const maxValue = 100; // Percentage-based

  for (let y = height; y >= 0; y--) {
    const value = (maxValue * y) / height;
    graph += `│ ${String(Math.round(value)).padStart(3)}% `;

    for (let x = 0; x < buckets.length; x++) {
      const bucket = buckets[x];
      const barHeight = (parseFloat(bucket[field]) / maxValue) * height;
      if (barHeight >= y) {
        graph += getColoredBar(parseFloat(bucket[field]));
      } else {
        graph += ' ';
      }
    }
    graph += ` │\n`;
  }

  graph += `├──────`;
  for (let x = 0; x < buckets.length; x++) {
    graph += '─';
  }
  graph += `┤\n`;

  graph += `│ Hour `;
  for (let x = 0; x < buckets.length; x++) {
    if (x % 3 === 0) {
      graph += buckets[x].time.charAt(0);
    } else {
      graph += ' ';
    }
  }
  graph += ` │\n└──────`;
  for (let x = 0; x < buckets.length; x++) {
    graph += '─';
  }
  graph += `┘\n`;

  return graph;
}

function getColoredBar(percent) {
  if (percent >= 90) {
    return `\x1b[41m▓\x1b[0m`; // Red - critical
  } else if (percent >= 75) {
    return `\x1b[43m▓\x1b[0m`; // Yellow - high
  } else if (percent >= 50) {
    return `\x1b[44m▓\x1b[0m`; // Blue - moderate
  } else if (percent >= 25) {
    return `\x1b[46m░\x1b[0m`; // Cyan - light
  } else {
    return `\x1b[42m░\x1b[0m`; // Green - minimal
  }
}

function generatePartitionSummary(nodesByPartition, capacityByPartition, jobs) {
  let summary = '\n┌─ Partition Summary\n';

  Object.keys(nodesByPartition)
    .sort()
    .forEach((partition) => {
      const nodes = nodesByPartition[partition];
      const capacity = capacityByPartition[partition];
      const partitionJobs = jobs.filter((j) => j.partition === partition);
      const totalNodes = nodes.idle + nodes.allocated + nodes.down + nodes.other;
      const utilizationPercent = (
        (nodes.allocated / totalNodes) *
        100
      ).toFixed(0);

      summary += `│ ${partition.padEnd(12)} Nodes: ${String(nodes.allocated).padStart(2)}/${String(totalNodes).padStart(2)} (${utilizationPercent}%) │ CPUs: ${String(capacity.totalCpus).padStart(5)} │ Mem: ${String(capacity.totalMemGb).padStart(6)}GB │ Jobs: ${String(partitionJobs.length).padStart(4)} │\n`;
    });

  summary += `└────────────────────────────────────────────────────────────────┘\n`;

  return summary;
}

export const clusterUsage24hTool = {
  name: 'get_cluster_usage_24h',
  description:
    'Get cluster CPU and memory usage trends for the last 24 hours with detailed partition breakdown and utilization percentages.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

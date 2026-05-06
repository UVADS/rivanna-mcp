export async function getClusterUsage24h(sshClient, options = {}) {
  // Get current node info for capacity calculation
  const sinfoOutput = await sshClient.exec(
    'sinfo --format="%20N %6c %10m" --noheader'
  );
  const nodes = sinfoOutput
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        cpus: parseInt(parts[1], 10),
        memory: parseInt(parts[2], 10),
      };
    });

  const totalCpuCapacity = nodes.reduce((sum, n) => sum + n.cpus, 0);
  const totalMemCapacity = nodes.reduce((sum, n) => sum + n.memory, 0);

  // Get job accounting for last 24 hours
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1);
  const dateStr = startDate.toISOString().split('T')[0];

  const sacctCmd = `sacct --format=jobid,start,end,alloccpus,maxvmsize,state --noheader --start=${dateStr} --allocations`;
  const sacctOutput = await sshClient.exec(sacctCmd);

  const jobs = sacctOutput
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        jobid: parts[0],
        start: new Date(parts[1]),
        end: new Date(parts[2]),
        cpus: parseInt(parts[3], 10) || 0,
        memory: parseInt(parts[4], 10) || 0,
        state: parts[5],
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

      // Check if job overlaps with this bucket
      if (job.start < bucketEnd && job.end > bucketStart) {
        buckets[i].cpuUsage += job.cpus;
        buckets[i].memUsage += job.memory;
        buckets[i].jobCount += 1;
      }
    }
  });

  // Generate colored ASCII graphics
  const maxCpuUsage = Math.max(...buckets.map((b) => b.cpuUsage), 1);
  const maxMemUsage = Math.max(...buckets.map((b) => b.memUsage), 1);

  const cpuGraph = generateGraph(
    buckets,
    'cpuUsage',
    totalCpuCapacity,
    'CPU',
    '█'
  );
  const memGraph = generateGraph(
    buckets,
    'memUsage',
    totalMemCapacity,
    'Memory (GB)',
    '▓'
  );

  return {
    success: true,
    period: '24 hours',
    capacity: {
      totalCpus: totalCpuCapacity,
      totalMemoryGb: totalMemCapacity,
    },
    summary: {
      totalJobs: jobs.length,
      avgCpuUsage: (
        buckets.reduce((sum, b) => sum + b.cpuUsage, 0) / buckets.length
      ).toFixed(1),
      peakCpuUsage: Math.max(...buckets.map((b) => b.cpuUsage)),
      avgMemUsage: (
        buckets.reduce((sum, b) => sum + b.memUsage, 0) / buckets.length
      ).toFixed(1),
      peakMemUsage: Math.max(...buckets.map((b) => b.memUsage)),
    },
    buckets,
    graphs: {
      cpu: cpuGraph,
      memory: memGraph,
    },
  };
}

function generateGraph(buckets, field, capacity, label, barChar) {
  const width = 60;
  const height = 15;

  let graph = `\n╔═══════════════════════════════════════════════════════════╗\n`;
  graph += `║ ${label.padEnd(57)} ║\n`;
  graph += `╠═══════════════════════════════════════════════════════════╣\n`;

  // Y-axis labels
  const maxValue = Math.max(...buckets.map((b) => b[field]), 1);
  for (let y = height; y >= 0; y--) {
    const value = (maxValue * y) / height;
    graph += `│ ${String(Math.round(value)).padStart(5)} │ `;

    // Draw bars
    for (let x = 0; x < buckets.length; x++) {
      const bucket = buckets[x];
      const barHeight = (bucket[field] / maxValue) * height;
      if (barHeight >= y) {
        graph += getColoredChar(barChar, bucket[field], maxValue);
      } else {
        graph += ' ';
      }
    }
    graph += ` │\n`;
  }

  graph += `├───────┼${Array(buckets.length).fill('─').join('')}┤\n`;
  graph += `│ Hour  │ `;

  // X-axis labels (every 4 hours)
  for (let x = 0; x < buckets.length; x++) {
    if (x % 4 === 0) {
      graph += buckets[x].time;
    } else {
      graph += '  ';
    }
  }

  graph += ` │\n`;
  graph += `└───────┴${Array(buckets.length).fill('─').join('')}┘\n`;

  return graph;
}

function getColoredChar(char, value, maxValue) {
  const percent = (value / maxValue) * 100;

  if (percent >= 80) {
    return `\x1b[41m${char}\x1b[0m`; // Red background
  } else if (percent >= 60) {
    return `\x1b[43m${char}\x1b[0m`; // Yellow background
  } else if (percent >= 40) {
    return `\x1b[44m${char}\x1b[0m`; // Blue background
  } else if (percent > 0) {
    return `\x1b[42m${char}\x1b[0m`; // Green background
  }
  return ' ';
}

export const clusterUsage24hTool = {
  name: 'get_cluster_usage_24h',
  description:
    'Get cluster CPU and memory usage trends for the last 24 hours with colored ASCII graphics.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

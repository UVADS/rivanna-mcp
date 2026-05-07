export function parseLineDelimited(output) {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
}

export function parseSacctOutput(output) {
  const lines = parseLineDelimited(output);
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(/\s{2,}/)
    .map((h) => h.trim().toLowerCase());

  const rows = lines.slice(1).map((line) => {
    const values = line.split(/\s{2,}/).map((v) => v.trim());
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i];
    });
    return row;
  });

  return rows;
}

export function parseSqueueOutput(output) {
  const lines = parseLineDelimited(output);
  if (lines.length === 0) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(/\s+/).map((h) => h.toLowerCase());

  const jobs = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    const job = {};

    headers.forEach((header, idx) => {
      job[header] = parts[idx] || '';
    });

    jobs.push(job);
  }

  return jobs;
}

export function parseSinfoOutput(output) {
  const lines = parseLineDelimited(output);
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(/\s+/)
    .map((h) => h.toLowerCase());

  const nodes = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    const node = {};

    headers.forEach((header, idx) => {
      node[header] = parts[idx] || '';
    });

    nodes.push(node);
  }

  return nodes;
}

export function parseQuotaOutput(output) {
  const lines = parseLineDelimited(output);
  const quota = {};

  lines.forEach((line) => {
    const match = line.match(/^(.+?)\s+(.+?)\s+(.+?)\s+(.+?)$/);
    if (match) {
      quota[match[1].trim()] = {
        used: match[2].trim(),
        limit: match[3].trim(),
        percent: match[4].trim(),
      };
    }
  });

  return quota;
}

// Expand SLURM node ranges (e.g., "node[0-2,5]" => ["node0", "node1", "node2", "node5"])
export function expandNodeRanges(nodeSpec) {
  if (!nodeSpec.includes('[')) {
    return [nodeSpec];
  }

  const match = nodeSpec.match(/^(.+?)\[(.+?)\](.*)$/);
  if (!match) return [nodeSpec];

  const [, prefix, rangeSpec, suffix] = match;
  const parts = rangeSpec.split(',');
  const expanded = [];

  parts.forEach((part) => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((s) => s.trim());
      const startNum = parseInt(start, 10);
      const endNum = parseInt(end, 10);

      if (!isNaN(startNum) && !isNaN(endNum)) {
        const padding = start.length;
        for (let i = startNum; i <= endNum; i++) {
          expanded.push(`${prefix}${String(i).padStart(padding, '0')}${suffix}`);
        }
      } else {
        // Non-numeric range, just use as-is
        expanded.push(`${prefix}${part}${suffix}`);
      }
    } else {
      expanded.push(`${prefix}${part.trim()}${suffix}`);
    }
  });

  return expanded;
}

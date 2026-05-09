export function parseLineDelimited(output) {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
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

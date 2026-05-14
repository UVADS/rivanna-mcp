import { shellQuote } from '../utils.js';
import { getToolDef } from './loader.js';

export async function searchModules(sshClient, options = {}) {
  const { query } = options;

  if (!query || !query.trim()) {
    return { success: false, error: 'query is required' };
  }

  // LMOD's `module` is a shell function — must use a login shell to source it.
  // Use the probed login shell (bash unless .bash_profile replaces it with zsh, etc.).
  // --terse emits one module:version per line, which is easy to parse.
  // stderr carries the actual module list; stdout is empty. Redirect both to stdout.
  const shell = await sshClient.getLoginShell();
  const cmd = `${shell} -l -c "module --terse spider ${shellQuote(query)} 2>&1"`;

  let output;
  try {
    output = await sshClient.exec(cmd);
  } catch (err) {
    // LMOD exits 1 with "Unable to find" when no module matches — treat as empty results
    if (/unable to find|no module.*found/i.test(err.message)) {
      return { success: true, query, count: 0, modules: [], message: `No modules found matching "${query}".` };
    }
    return { success: false, query, error: `Module search failed: ${err.message}` };
  }

  if (!output || !output.trim()) {
    return { success: true, query, count: 0, modules: [], message: `No modules found matching "${query}".` };
  }

  const modules = parseModuleSpider(output);

  return {
    success: true,
    query,
    count: modules.length,
    modules,
  };
}

function parseModuleSpider(output) {
  const modules = [];
  const seen = new Set();

  const addEntry = (full) => {
    if (seen.has(full)) return;
    seen.add(full);
    const slash = full.indexOf('/');
    modules.push({
      module:  slash !== -1 ? full.slice(0, slash) : full,
      version: slash !== -1 ? full.slice(slash + 1) : null,
      full,
    });
  };

  for (const raw of output.trim().split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('-') || line.startsWith('Lmod') || line.startsWith('The following')) continue;

    // Verbose single-match format: "  jq: jq/1.8.1" header line
    const headerMatch = line.match(/^\w[\w.+-]*:\s+([\w.+-]+\/[\w.+-]+)$/);
    if (headerMatch) { addEntry(headerMatch[1]); continue; }

    // Explicit load line: "module load jq/1.8.1"
    const loadMatch = line.match(/module load ([\w.+-]+(?:\/[\w.+-]+)?)/);
    if (loadMatch) { addEntry(loadMatch[1]); continue; }

    // Terse multi-match format: "jq/1.8.1" (no spaces, optional slash)
    if (!line.includes(' ')) { addEntry(line); }
  }

  const grouped = {};
  for (const m of modules) {
    if (!grouped[m.module]) grouped[m.module] = [];
    if (m.version) grouped[m.module].push(m.version);
  }

  return Object.entries(grouped).map(([name, versions]) => ({
    name,
    versions: versions.length ? versions : null,
    latestFull: versions.length ? `${name}/${versions[versions.length - 1]}` : name,
  }));
}

export const searchModulesTool = getToolDef('search_modules');

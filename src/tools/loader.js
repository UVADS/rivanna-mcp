import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { load as parseYaml } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

let toolDefs;
try {
  const raw = readFileSync(join(__dirname, 'tools.yaml'), 'utf-8');
  const parsed = parseYaml(raw);
  toolDefs = new Map(parsed.tools.map((t) => [t.name, t]));
} catch (err) {
  throw new Error(`Failed to load tools.yaml: ${err.message}`);
}

export function getToolDef(name) {
  const def = toolDefs.get(name);
  if (!def) throw new Error(`No tool definition in tools.yaml for: ${name}`);
  return def;
}

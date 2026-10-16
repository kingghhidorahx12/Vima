import { open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function durableJson(path: string, value: unknown, exclusive = false) {
  const temporary = exclusive ? path : `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  if (!exclusive) await rename(temporary, path);
  // Linux/Railway: persist the rename itself, not just the file contents.
  if (process.platform !== 'win32') { const dir = await open(dirname(path), 'r'); try { await dir.sync(); } finally { await dir.close(); } }
}

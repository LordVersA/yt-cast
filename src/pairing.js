import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_DIR } from './state.js';

const file = join(STATE_DIR, 'pairing.json');
export function clearPairing() { rmSync(file, { force: true }); }
export function writePairing(code) {
  mkdirSync(STATE_DIR, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ code, expiresAt: Date.now() + 300000 }), { mode: 0o600 });
  renameSync(temporary, file);
}
export function readPairing() {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data.code && data.expiresAt > Date.now() ? data : null;
  } catch { return null; }
}

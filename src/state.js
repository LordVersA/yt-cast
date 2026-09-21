import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const STATE_DIR = join(homedir(), '.yt-cast');
export const STATE_FILE = join(STATE_DIR, 'state.json');
export const LOG_FILE = join(STATE_DIR, 'daemon.log');

/**
 * The daemon writes; the CLI reads. Writes go through a temp file + rename so
 * the CLI never observes a half-written JSON document.
 */
export function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Position the phone reported, advanced by the time elapsed since it said so.
 * While playing, the phone only pushes a position on discrete events, so
 * without this the timestamp would be stale by however long ago that was.
 */
export function livePosition(state, now = Date.now()) {
  if (!state) return 0;
  const base = state.position ?? 0;
  if (state.status !== 'playing') return base;
  const elapsed = (now - (state.updatedAt ?? now)) / 1000;
  const advanced = base + Math.max(0, elapsed);
  // Don't run past the end of a video of known length.
  return state.duration > 0 ? Math.min(advanced, state.duration) : advanced;
}

export function buildUrl(state, { position } = {}) {
  if (!state?.videoId) return null;
  const t = Math.floor(position ?? livePosition(state));
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', state.videoId);
  if (state.playlistId) url.searchParams.set('list', state.playlistId);
  if (t > 0) url.searchParams.set('t', `${t}s`);
  return url.toString();
}

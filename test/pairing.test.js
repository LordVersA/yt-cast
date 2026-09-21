import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'yt-cast-pairing-'));
process.env.YTC_STATE_DIR = dir;

const { clearPairing, readPairing, writePairing } = await import('../src/pairing.js');
const { readState, writeState, STATE_FILE } = await import('../src/state.js');

describe('pairing', () => {
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('round-trips a code', () => {
    writePairing('123456789');
    assert.equal(readPairing().code, '123456789');
  });

  it('clears a code', () => {
    writePairing('123456789');
    clearPairing();
    assert.equal(readPairing(), null);
  });

  it('is safe to clear when nothing is stored', () => {
    clearPairing();
    assert.doesNotThrow(() => clearPairing());
  });

  it('ignores an expired code', () => {
    const file = join(dir, 'pairing.json');
    writeFileSync(file, JSON.stringify({ code: 'old', expiresAt: Date.now() - 1000 }));
    assert.equal(readPairing(), null);
  });

  it('ignores a corrupt file rather than throwing', () => {
    writeFileSync(join(dir, 'pairing.json'), 'not json at all');
    assert.equal(readPairing(), null);
  });

  it('is not world-readable, since it grants screen access', () => {
    writePairing('123456789');
    const mode = statSync(join(dir, 'pairing.json')).mode & 0o777;
    assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
  });
});

describe('state persistence', () => {
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('round-trips through the file', () => {
    const state = {
      videoId: 'abc',
      playlistId: 'PL1',
      position: 12.5,
      duration: 0,
      status: 'playing',
      updatedAt: 1700000000000
    };
    writeState(state);
    assert.deepEqual(readState(), state);
  });

  it('returns null when nothing has been written', () => {
    rmSync(STATE_FILE, { force: true });
    assert.equal(readState(), null);
  });

  it('returns null for a corrupt file rather than throwing', () => {
    writeFileSync(STATE_FILE, '{ truncated');
    assert.equal(readState(), null);
  });

  it('leaves no temp files behind', () => {
    writeState({ videoId: 'abc', position: 0, status: 'playing', updatedAt: Date.now() });
    const leftovers = readFileSync(STATE_FILE, 'utf8');
    assert.ok(leftovers.startsWith('{'), 'state file should be complete JSON');
    assert.doesNotThrow(() => JSON.parse(leftovers));
  });

  it('overwrites cleanly on repeated writes', () => {
    writeState({ videoId: 'first', position: 1, status: 'playing', updatedAt: 1 });
    writeState({ videoId: 'second', position: 2, status: 'paused', updatedAt: 2 });
    assert.equal(readState().videoId, 'second');
  });
});

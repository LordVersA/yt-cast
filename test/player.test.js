import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

// Redirect state writes before the modules under test resolve STATE_DIR.
const dir = mkdtempSync(join(tmpdir(), 'yt-cast-player-'));
process.env.YTC_STATE_DIR = dir;

const { default: RecordingPlayer } = await import('../src/player.js');
const { readState } = await import('../src/state.js');

const silent = { info() {}, debug() {}, warn() {}, error() {} };

function newPlayer(onChange) {
  const player = new RecordingPlayer(onChange);
  // The framework normally injects this; without it the base class throws.
  player.setLogger(silent);
  return player;
}

const video = (id = 'vid1', playlistId = null) => ({
  id,
  context: playlistId ? { playlistId } : {}
});

describe('RecordingPlayer', () => {
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('records the video and position on play', async () => {
    const player = newPlayer();
    await player.play(video('abc123'), 217);
    const state = readState();
    assert.equal(state.videoId, 'abc123');
    assert.equal(state.status, 'playing');
    assert.ok(Math.abs(state.position - 217) < 1);
  });

  it('captures the playlist id when present', async () => {
    const player = newPlayer();
    await player.play(video('abc123', 'PLxyz'), 0);
    assert.equal(readState().playlistId, 'PLxyz');
  });

  it('reports no playlist for a standalone video', async () => {
    const player = newPlayer();
    await player.play(video('abc123'), 0);
    assert.equal(readState().playlistId, null);
  });

  it('notifies the listener on every change', async () => {
    const seen = [];
    const player = newPlayer((state) => seen.push(state.status));
    await player.play(video(), 0);
    await player.pause();
    await player.resume();
    await player.stop();
    assert.deepEqual(seen, ['playing', 'paused', 'playing', 'stopped']);
  });

  it('advances position while playing', async () => {
    const player = newPlayer();
    await player.play(video(), 10);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const position = await player.getPosition();
    assert.ok(position > 10, `expected > 10, got ${position}`);
  });

  it('freezes position while paused', async () => {
    const player = newPlayer();
    await player.play(video(), 10);
    await player.pause();
    const first = await player.getPosition();
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(await player.getPosition(), first);
  });

  it('resumes from where it paused, not from where the clock went', async () => {
    const player = newPlayer();
    await player.play(video(), 50);
    await player.pause();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await player.resume();
    const position = await player.getPosition();
    assert.ok(position >= 50 && position < 50.2, `expected ~50, got ${position}`);
  });

  it('seeks to an exact position', async () => {
    const player = newPlayer();
    await player.play(video(), 500);
    await player.seek(42);
    assert.ok(Math.abs(readState().position - 42) < 1);
  });

  it('keeps playing status through a seek', async () => {
    const player = newPlayer();
    await player.play(video(), 10);
    await player.seek(99);
    assert.equal(readState().status, 'playing');
  });

  it('resumes when seeking while paused, as a TV does', async () => {
    // Upstream Player.seek() calls resume() if the previous status was paused,
    // so scrubbing a paused video starts it playing. The mirror depends on
    // this: it reads status, and must not fight a resume the phone expects.
    const player = newPlayer();
    await player.play(video(), 10);
    await player.pause();
    await player.seek(99);
    assert.equal(readState().status, 'playing');
    assert.ok(Math.abs(readState().position - 99) < 1);
  });

  it('switches videos cleanly', async () => {
    const player = newPlayer();
    await player.play(video('first'), 300);
    await player.play(video('second'), 0);
    const state = readState();
    assert.equal(state.videoId, 'second');
    assert.ok(state.position < 1, 'position should reset with the new video');
  });

  it('round-trips volume', async () => {
    const player = newPlayer();
    await player.setVolume({ level: 40, muted: false });
    assert.deepEqual(await player.getVolume(), { level: 40, muted: false });
  });

  it('reports unknown duration as 0, which is honest for live', async () => {
    const player = newPlayer();
    await player.play(video(), 0);
    assert.equal(await player.getDuration(), 0);
  });
});

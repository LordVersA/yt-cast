import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildUrl, livePosition } from '../src/state.js';

/** A phone report, with sane defaults. */
function report(overrides = {}) {
  return {
    videoId: 'dQw4w9WgXcQ',
    playlistId: null,
    position: 100,
    duration: 0,
    status: 'playing',
    updatedAt: Date.now(),
    ...overrides
  };
}

describe('livePosition', () => {
  it('advances with wall-clock time while playing', () => {
    const now = Date.now();
    const state = report({ position: 100, updatedAt: now - 5000 });
    assert.equal(livePosition(state, now), 105);
  });

  it('holds still while paused', () => {
    const now = Date.now();
    const state = report({ status: 'paused', position: 100, updatedAt: now - 5000 });
    assert.equal(livePosition(state, now), 100);
  });

  it('holds still while stopped', () => {
    const now = Date.now();
    const state = report({ status: 'stopped', position: 42, updatedAt: now - 9000 });
    assert.equal(livePosition(state, now), 42);
  });

  it('never runs past a known duration', () => {
    const now = Date.now();
    const state = report({ position: 100, duration: 102, updatedAt: now - 60000 });
    assert.equal(livePosition(state, now), 102);
  });

  it('extrapolates without limit when duration is unknown', () => {
    const now = Date.now();
    const state = report({ position: 100, duration: 0, updatedAt: now - 60000 });
    assert.equal(livePosition(state, now), 160);
  });

  it('never goes backwards if the clock jumps', () => {
    const now = Date.now();
    // updatedAt in the future, e.g. after an NTP correction.
    const state = report({ position: 100, updatedAt: now + 5000 });
    assert.equal(livePosition(state, now), 100);
  });

  it('returns 0 for missing state', () => {
    assert.equal(livePosition(null), 0);
    assert.equal(livePosition(undefined), 0);
  });

  it('treats a missing position as 0', () => {
    const now = Date.now();
    assert.equal(livePosition({ status: 'paused', updatedAt: now }, now), 0);
  });
});

describe('buildUrl', () => {
  it('builds a watch URL with the timestamp', () => {
    const url = buildUrl(report({ status: 'paused', position: 217 }));
    assert.equal(url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=217s');
  });

  it('includes the playlist when there is one', () => {
    const url = buildUrl(report({ status: 'paused', position: 5, playlistId: 'PLabc' }));
    assert.equal(url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc&t=5s');
  });

  it('omits t= at the start of a video', () => {
    const url = buildUrl(report({ status: 'paused', position: 0 }));
    assert.equal(url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('floors fractional positions', () => {
    const url = buildUrl(report({ status: 'paused', position: 42.9 }));
    assert.match(url, /t=42s$/);
  });

  it('honours an explicit position over the stored one', () => {
    const url = buildUrl(report({ position: 900 }), { position: 30 });
    assert.match(url, /t=30s$/);
  });

  it('accepts position 0 as an override rather than falling back', () => {
    const url = buildUrl(report({ position: 900 }), { position: 0 });
    assert.equal(url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('returns null without a video', () => {
    assert.equal(buildUrl(null), null);
    assert.equal(buildUrl({ videoId: null }), null);
  });

  it('percent-encodes ids rather than injecting raw query text', () => {
    const url = buildUrl(report({ status: 'paused', position: 0, videoId: 'a&b=c' }));
    assert.match(url, /v=a%26b%3Dc/);
  });
});

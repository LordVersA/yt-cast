import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

/**
 * Mirror drives the browser through src/browser.js, which shells out to
 * osascript. That module is mocked so these tests exercise the decision
 * logic — when to open, when to reconcile, when to give up — without Chrome.
 */
const calls = { opened: [], synced: [] };
let openImpl;
let syncImpl;

class FakeDisabledError extends Error {}

mock.module(new URL('../src/browser.js', import.meta.url).href, {
  namedExports: {
    BrowserDisabledError: FakeDisabledError,
    async openUrl(url) {
      calls.opened.push(url);
      return openImpl ? openImpl(url) : 'opened';
    },
    async syncTab(target) {
      calls.synced.push(target);
      return syncImpl ? syncImpl(target) : 'ok';
    },
    async readTabPosition() {
      return null;
    }
  }
});

const { default: Mirror } = await import('../src/mirror.js');

function reset() {
  calls.opened = [];
  calls.synced = [];
  openImpl = null;
  syncImpl = null;
}

const report = (overrides = {}) => ({
  videoId: 'vid1',
  playlistId: null,
  position: 30,
  duration: 0,
  status: 'playing',
  updatedAt: Date.now(),
  ...overrides
});

/** Long enough for at least one 1s tick. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 1200));

describe('Mirror', () => {
  it('opens a tab for a new video', async () => {
    reset();
    const mirror = new Mirror(() => {});
    mirror.update(report({ position: 217 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    mirror.stop();
    assert.equal(calls.opened.length, 1);
    assert.match(calls.opened[0], /v=vid1/);
    assert.match(calls.opened[0], /t=217s/);
  });

  it('does not reopen when only the position changes', async () => {
    reset();
    const mirror = new Mirror(() => {});
    mirror.update(report({ position: 10 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    mirror.update(report({ position: 200 }));
    mirror.update(report({ position: 400 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    mirror.stop();
    assert.equal(calls.opened.length, 1, 'a seek should sync, not reopen');
  });

  it('opens again when the video changes', async () => {
    reset();
    const mirror = new Mirror(() => {});
    mirror.update(report({ videoId: 'first' }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    mirror.update(report({ videoId: 'second' }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    mirror.stop();
    assert.equal(calls.opened.length, 2);
    assert.match(calls.opened[1], /v=second/);
  });

  it('reconciles the tab on a timer while playing', async () => {
    reset();
    const mirror = new Mirror(() => {});
    mirror.update(report());
    await tick();
    mirror.stop();
    assert.ok(calls.synced.length >= 1, 'expected at least one sync tick');
    assert.equal(calls.synced[0].videoId, 'vid1');
  });

  it('passes the paused flag through to the tab', async () => {
    reset();
    const mirror = new Mirror(() => {});
    mirror.update(report({ status: 'paused' }));
    await tick();
    mirror.stop();
    assert.equal(calls.synced.at(-1).paused, true);
  });

  it('stops everything when playback stops', async () => {
    reset();
    const mirror = new Mirror(() => {});
    mirror.update(report());
    await new Promise((resolve) => setTimeout(resolve, 30));
    mirror.update(report({ status: 'stopped' }));
    const after = calls.synced.length;
    await tick();
    mirror.stop();
    assert.equal(calls.synced.length, after, 'no ticks after stop');
  });

  it('gives up syncing when the tab is gone', async () => {
    reset();
    syncImpl = () => null; // browser.js returns null when no tab matches
    const mirror = new Mirror(() => {});
    mirror.update(report());
    await tick();
    const after = calls.synced.length;
    await tick();
    mirror.stop();
    assert.equal(calls.synced.length, after, 'should stop ticking once the tab closes');
  });

  it('warns once, not every tick, when the browser blocks control', async () => {
    reset();
    const logs = [];
    syncImpl = () => {
      throw new FakeDisabledError('blocked');
    };
    const mirror = new Mirror((line) => logs.push(line));
    mirror.update(report());
    await tick();
    await tick();
    mirror.stop();
    const warnings = logs.filter((line) => line.includes('disabled'));
    assert.equal(warnings.length, 1, `expected one warning, got ${warnings.length}`);
  });

  it('keeps opening tabs even when sync is disabled', async () => {
    reset();
    syncImpl = () => {
      throw new FakeDisabledError('blocked');
    };
    const mirror = new Mirror(() => {});
    mirror.update(report({ videoId: 'first' }));
    await tick();
    mirror.update(report({ videoId: 'second' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    mirror.stop();
    assert.equal(calls.opened.length, 2, 'auto-open must not depend on JS injection');
  });

  it('ignores state with no video', async () => {
    reset();
    const mirror = new Mirror(() => {});
    mirror.update(report({ videoId: null }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    mirror.stop();
    assert.equal(calls.opened.length, 0);
  });

  it('survives a transient browser error and keeps going', async () => {
    reset();
    let first = true;
    syncImpl = () => {
      if (first) {
        first = false;
        throw new Error('osascript timed out');
      }
      return 'ok';
    };
    const logs = [];
    const mirror = new Mirror((line) => logs.push(line));
    mirror.update(report());
    await tick();
    await tick();
    mirror.stop();
    assert.ok(calls.synced.length >= 2, 'a one-off failure should not stop the loop');
  });
});

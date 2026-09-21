import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it } from 'node:test';

/**
 * The sync script runs in the browser, not here, so it is extracted from the
 * source and evaluated against a fake <video>. This keeps the real page
 * contract under test without driving Chrome.
 */
const source = readFileSync(new URL('../src/browser.js', import.meta.url), 'utf8');
const syncScript = new Function(
  'function jsLiteral(v){return JSON.stringify(String(v));}' +
    source.match(/function syncScript[\s\S]*?\n}/)[0] +
    '; return syncScript;'
)();

/** Run the injected script against a fake page. */
function evaluate({ video, videoId = 'abc123', pageId = 'abc123', position = 42.5, paused = false }) {
  const element = video === undefined ? fakeVideo() : video;
  const sandbox = {
    document: { querySelector: () => element },
    location: { search: `?v=${pageId}` },
    URLSearchParams
  };
  const result = runInNewContext(syncScript({ videoId, position, paused }), sandbox);
  return { result, video: element };
}

function fakeVideo(overrides = {}) {
  return {
    currentTime: 0,
    paused: false,
    duration: 300,
    readyState: 4,
    played: false,
    play() {
      this.paused = false;
      this.played = true;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    ...overrides
  };
}

describe('sync script', () => {
  it('seeks when the tab has drifted', () => {
    const { result, video } = evaluate({ video: fakeVideo({ currentTime: 10 }), position: 42.5 });
    assert.match(result, /seek/);
    assert.equal(video.currentTime, 42.5);
  });

  it('leaves small drift alone, so it does not fight the player', () => {
    const { result, video } = evaluate({ video: fakeVideo({ currentTime: 42 }), position: 42.5 });
    assert.equal(result, 'ok');
    assert.equal(video.currentTime, 42);
  });

  it('pauses the tab when the phone is paused', () => {
    const { result, video } = evaluate({
      video: fakeVideo({ currentTime: 42.5, paused: false }),
      position: 42.5,
      paused: true
    });
    assert.match(result, /pause/);
    assert.equal(video.paused, true);
  });

  it('plays the tab when the phone is playing', () => {
    const { result, video } = evaluate({
      video: fakeVideo({ currentTime: 42.5, paused: true }),
      position: 42.5,
      paused: false
    });
    assert.match(result, /play/);
    assert.equal(video.paused, false);
  });

  it('seeks and plays in one pass', () => {
    const { result, video } = evaluate({
      video: fakeVideo({ currentTime: 0, paused: true }),
      position: 42.5,
      paused: false
    });
    assert.equal(result, 'seek+play');
    assert.equal(video.currentTime, 42.5);
    assert.equal(video.paused, false);
  });

  it('never seeks a live stream', () => {
    const { result, video } = evaluate({
      video: fakeVideo({ currentTime: 5, duration: Infinity }),
      position: 9999
    });
    assert.doesNotMatch(result, /seek/);
    assert.equal(video.currentTime, 5);
  });

  it('still matches play state on a live stream', () => {
    const { result, video } = evaluate({
      video: fakeVideo({ currentTime: 5, duration: Infinity, paused: false }),
      position: 9999,
      paused: true
    });
    assert.match(result, /pause/);
    assert.equal(video.paused, true);
  });

  it('does nothing while the video is still loading', () => {
    const { result, video } = evaluate({
      video: fakeVideo({ currentTime: 0, readyState: 0 }),
      position: 42.5
    });
    assert.equal(result, 'not-ready');
    assert.equal(video.currentTime, 0);
  });

  it('does not touch a tab showing a different video', () => {
    const { result, video } = evaluate({
      video: fakeVideo({ currentTime: 3 }),
      videoId: 'wanted',
      pageId: 'something-else'
    });
    assert.equal(result, 'wrong-video');
    assert.equal(video.currentTime, 3);
  });

  it('reports when the page has no video element', () => {
    const { result } = evaluate({ video: null });
    assert.equal(result, 'no-video');
  });

  it('survives a play() that the browser rejects', () => {
    const video = fakeVideo({
      currentTime: 42.5,
      paused: true,
      play() {
        return Promise.reject(new Error('autoplay blocked'));
      }
    });
    // Must not throw: an unhandled rejection here would break the tick loop.
    const { result } = evaluate({ video, position: 42.5, paused: false });
    assert.match(result, /play/);
  });
});

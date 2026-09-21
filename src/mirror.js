import { BrowserDisabledError, openUrl, syncTab } from './browser.js';
import { buildUrl, livePosition } from './state.js';

/** How often to reconcile the tab against the phone while playing. */
const TICK_MS = 1000;

/**
 * Keeps a browser tab following the phone.
 *
 * The phone pushes state on events only, so between events we extrapolate
 * (livePosition) and reconcile on a timer. The tab is the follower and never
 * the source of truth: if you scrub in the browser, the next tick pulls it
 * back to wherever the phone is.
 */
export default class Mirror {
  #state = null;
  #timer = null;
  #busy = false;
  #openedVideo = null;
  #disabled = false;
  #log;

  constructor(log = console.log) {
    this.#log = log;
  }

  /** Feed the latest phone state. Called on every player event. */
  update(state) {
    this.#state = state;

    if (!state?.videoId || state.status === 'stopped') {
      this.#openedVideo = null;
      this.#stopTimer();
      return;
    }

    // A new video means a fresh page load rather than a seek.
    if (state.videoId !== this.#openedVideo) {
      this.#openedVideo = state.videoId;
      void this.#open(state);
    }

    this.#startTimer();
  }

  stop() {
    this.#stopTimer();
  }

  async #open(state) {
    // Note: not gated on #disabled. Opening a tab needs no JavaScript
    // injection, so auto-open keeps working even when live sync cannot.
    const url = buildUrl(state, { position: livePosition(state) });
    try {
      const how = await openUrl(url);
      this.#log(`[mirror] ${how} tab → ${url}`);
    } catch (error) {
      this.#handle(error);
    }
  }

  #startTimer() {
    if (this.#timer || this.#disabled) return;
    this.#timer = setInterval(() => void this.#tick(), TICK_MS);
    // Don't hold the event loop open on shutdown.
    this.#timer.unref?.();
  }

  #stopTimer() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  async #tick() {
    // osascript round-trips can outlast a tick; skip rather than pile up.
    if (this.#busy || this.#disabled || !this.#state?.videoId) return;
    this.#busy = true;
    try {
      const result = await syncTab({
        videoId: this.#state.videoId,
        position: livePosition(this.#state),
        paused: this.#state.status !== 'playing'
      });
      // Tab closed — stop reconciling until the phone acts again.
      if (result === null) {
        this.#openedVideo = null;
        this.#stopTimer();
      } else if (result && result !== 'ok') {
        this.#log(`[mirror] ${result}`);
      }
    } catch (error) {
      this.#handle(error);
    } finally {
      this.#busy = false;
    }
  }

  /** One clear warning, then stay quiet — this fires every tick otherwise. */
  #handle(error) {
    if (error instanceof BrowserDisabledError) {
      this.#disabled = true;
      this.#stopTimer();
      this.#log(`[mirror] disabled: ${error.message}`);
      return;
    }
    this.#log(`[mirror] ${error.message}`);
  }
}

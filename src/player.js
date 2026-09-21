import { Player } from 'yt-cast-receiver';
import { writeState } from './state.js';

/**
 * A player that never plays anything.
 *
 * yt-cast-receiver expects an implementation that renders video. We only want
 * the metadata the phone pushes along the way — which video, and how far in —
 * so every do* method just records state and reports success. The phone is
 * satisfied, and the real playback happens in a browser tab we open later.
 */
export default class RecordingPlayer extends Player {
  #video = null;
  #position = 0;
  #duration = 0;
  #playing = false;
  /** Wall clock at the moment #position was last true. */
  #since = Date.now();
  #volume = { level: 100, muted: false };

  constructor(onChange = () => {}) {
    super();
    this.#onChange = onChange;
  }

  #onChange;

  /** Freeze the drifting clock into #position. Call before changing state. */
  #settle() {
    this.#position = this.#now();
    this.#since = Date.now();
  }

  /** Position as of this instant, extrapolated while playing. */
  #now() {
    if (!this.#playing) return this.#position;
    const elapsed = (Date.now() - this.#since) / 1000;
    const advanced = this.#position + elapsed;
    return this.#duration > 0 ? Math.min(advanced, this.#duration) : advanced;
  }

  #publish(status) {
    const state = {
      videoId: this.#video?.id ?? null,
      playlistId: this.#video?.context?.playlistId ?? null,
      position: this.#now(),
      duration: this.#duration,
      status,
      updatedAt: Date.now()
    };
    writeState(state);
    this.#onChange(state);
  }

  async doPlay(video, position) {
    this.#video = video;
    this.#position = position ?? 0;
    this.#since = Date.now();
    this.#playing = true;
    // The phone does not tell us the duration; it only ever asks. Zero means
    // "unknown", which is also the honest answer for a live stream.
    this.#duration = 0;
    this.#publish('playing');
    return true;
  }

  async doPause() {
    this.#settle();
    this.#playing = false;
    this.#publish('paused');
    return true;
  }

  async doResume() {
    this.#settle();
    this.#playing = true;
    this.#publish('playing');
    return true;
  }

  async doStop() {
    this.#settle();
    this.#playing = false;
    this.#publish('stopped');
    return true;
  }

  async doSeek(position) {
    this.#position = position;
    this.#since = Date.now();
    this.#publish(this.#playing ? 'playing' : 'paused');
    return true;
  }

  async doSetVolume(volume) {
    this.#volume = volume;
    return true;
  }

  async doGetVolume() {
    return this.#volume;
  }

  async doGetPosition() {
    return this.#now();
  }

  async doGetDuration() {
    return this.#duration;
  }
}

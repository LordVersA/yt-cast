import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const BROWSER = process.env.YTC_BROWSER || 'Google Chrome';

/** Errors Chrome raises when JS-from-Apple-Events is off. */
const JS_DISABLED = /Executing JavaScript through AppleScript is turned off/i;

export class BrowserDisabledError extends Error {}

async function osascript(script) {
  try {
    const { stdout } = await run('osascript', ['-e', script], { timeout: 10000 });
    return stdout.trim();
  } catch (error) {
    const message = error.stderr || error.message || '';
    if (JS_DISABLED.test(message)) {
      throw new BrowserDisabledError(
        'Chrome blocks JavaScript from Apple Events. Enable it in Chrome: View → Developer → Allow JavaScript from Apple Events, then restart Chrome.'
      );
    }
    throw new Error(message.trim() || String(error));
  }
}

/** A JS string literal, for embedding inside the injected script. */
function jsLiteral(value) {
  return JSON.stringify(String(value));
}

/** Escape a string for use inside an AppleScript "..." literal. */
function asLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Is our tab still open? Returns {windowIndex, tabIndex} or null.
 * Matched by video-agnostic URL prefix so it survives navigation within YouTube.
 */
async function findTab() {
  const out = await osascript(`
    tell application "${BROWSER}"
      set wi to 0
      repeat with w in windows
        set wi to wi + 1
        set ti to 0
        repeat with t in tabs of w
          set ti to ti + 1
          if URL of t contains "youtube.com/watch" then return (wi as text) & "," & (ti as text)
        end repeat
      end repeat
    end tell
    return ""`);
  if (!out) return null;
  const [windowIndex, tabIndex] = out.split(',').map(Number);
  return { windowIndex, tabIndex };
}

/** Run JS in our YouTube tab. Returns the result as a string, or null if gone. */
async function inTab(js) {
  const tab = await findTab();
  if (!tab) return null;
  // AppleScript string literals cannot span lines; flatten first.
  const oneLine = js.replace(/\s*\n\s*/g, ' ');
  return osascript(
    `tell application "${BROWSER}" to execute tab ${tab.tabIndex} of window ${tab.windowIndex} javascript "${asLiteral(oneLine)}"`
  );
}

/** Open the URL, reusing our tab if one is already open. */
export async function openUrl(url) {
  const tab = await findTab();
  if (tab) {
    await osascript(
      `tell application "${BROWSER}" to set URL of tab ${tab.tabIndex} of window ${tab.windowIndex} to "${url}"`
    );
    return 'reused';
  }
  await run('open', ['-a', BROWSER, url]);
  return 'opened';
}

/**
 * The page-side half of the mirror. Applies a target state to the <video>
 * element: seek when drifted past tolerance, and match play/pause.
 * Returns a short status string for logging.
 */
function syncScript({ videoId, position, paused }) {
  return `(function(){
    var v = document.querySelector('video');
    if (!v) return 'no-video';
    var id = new URLSearchParams(location.search).get('v');
    if (id !== ${jsLiteral(videoId)}) return 'wrong-video';
    if (v.readyState === 0) return 'not-ready';
    var drift = Math.abs(v.currentTime - ${position});
    var acted = [];
    // Live streams report Infinity duration; seeking there is meaningless.
    if (drift > 2 && isFinite(v.duration)) { v.currentTime = ${position}; acted.push('seek'); }
    if (${paused} && !v.paused) { v.pause(); acted.push('pause'); }
    if (!${paused} && v.paused) { v.play().catch(function(){}); acted.push('play'); }
    return acted.length ? acted.join('+') : 'ok';
  })()`;
}

export async function syncTab(target) {
  return inTab(syncScript(target));
}

/** Current playback position in the tab, or null if unavailable. */
export async function readTabPosition() {
  const out = await inTab(
    `(function(){var v=document.querySelector('video');return v?String(v.currentTime):'';})()`
  );
  const value = Number.parseFloat(out ?? '');
  return Number.isFinite(value) ? value : null;
}

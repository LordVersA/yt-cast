#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildUrl, livePosition, readState, STATE_FILE } from '../src/state.js';
import { readPairing } from '../src/pairing.js';

const run = promisify(execFile);
const args = process.argv.slice(2);
const has = (...flags) => flags.some((f) => args.includes(f));

if (has('-h', '--help')) {
  console.log(`yt-cast — open what your phone is playing, here.

Usage:
  yt-cast --pair       Show a TV code to connect without network discovery
  yt-cast              Open the current video in your browser
  yt-cast --status     Print what the phone last reported
  yt-cast --url        Print the URL only, don't open it
  yt-cast --from-start Open at 0:00 instead of the phone's position

Options:
  --browser <name>     Open in a specific browser (e.g. "Firefox")

First cast to this Mac once from the YouTube app's cast button.`);
  process.exit(0);
}

if (has('--pair')) {
  const pairing = readPairing();
  if (!pairing) {
    console.error('No current TV code. Ensure the daemon is running and can reach YouTube, then retry shortly.');
    process.exit(1);
  }
  console.log(`TV code: ${pairing.code}`);
  console.log('On your phone: YouTube → Settings → Watch on TV → Enter TV code.');
  console.log('After linking, play a video and run yt-cast.');
  process.exit(0);
}

const state = readState();

if (!state?.videoId) {
  console.error('Nothing playing yet.');
  console.error(`No video recorded in ${STATE_FILE}.`);
  console.error('Cast to this Mac from YouTube, or run yt-cast --pair to link with a TV code.');
  process.exit(1);
}

const position = has('--from-start') ? 0 : livePosition(state);
const url = buildUrl(state, { position });

if (has('--status')) {
  console.log(`video:    ${state.videoId}`);
  if (state.playlistId) console.log(`playlist: ${state.playlistId}`);
  console.log(`status:   ${state.status}`);
  console.log(`position: ${Math.floor(position)}s`);
  console.log(`updated:  ${new Date(state.updatedAt).toLocaleTimeString()}`);
  console.log(`url:      ${url}`);
  process.exit(0);
}

if (has('--url')) {
  console.log(url);
  process.exit(0);
}

const browserIndex = args.indexOf('--browser');
const browser = browserIndex !== -1 ? args[browserIndex + 1] : null;

if (browserIndex !== -1 && !browser) {
  console.error('--browser needs a name, e.g. --browser "Firefox"');
  process.exit(1);
}

try {
  await run('open', browser ? ['-a', browser, url] : [url]);
  console.log(`▶ ${url}`);
} catch (error) {
  console.error(`Could not open the browser: ${error.message}`);
  console.error(url);
  process.exit(1);
}

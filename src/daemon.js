import { hostname } from 'node:os';
import YouTubeCastReceiver from 'yt-cast-receiver';
import RecordingPlayer from './player.js';
import { clearPairing, writePairing } from './pairing.js';
import Mirror from './mirror.js';

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set, and that
// must be set before the runtime starts — so if we find ourselves proxied
// without it, re-exec once with it on. Otherwise the lounge requests go direct
// and fail on any machine that reaches YouTube through a local proxy.
if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
  const { spawnSync } = await import('node:child_process');
  const { status } = spawnSync(process.execPath, [import.meta.filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' }
  });
  process.exit(status ?? 1);
}

const deviceName = process.env.YTC_NAME || `${hostname().replace(/\.local$/, '')} (Browser)`;

// Mirroring is on by default; YTC_MIRROR=0 falls back to manual `yt-cast`.
const mirror = process.env.YTC_MIRROR === '0' ? null : new Mirror(console.log);

const player = new RecordingPlayer((state) => {
  const at = Math.floor(state.position);
  console.log(`[state] ${state.status} ${state.videoId ?? '-'} @ ${at}s`);
  mirror?.update(state);
});

const receiver = new YouTubeCastReceiver(player, {
  device: {
    name: deviceName,
    screenName: deviceName,
    brand: 'yt-cast',
    model: 'Browser'
  },
  logLevel: process.env.YTC_LOG_LEVEL || 'info'
});

receiver.on('senderConnect', (sender) => {
  console.log(`[sender] connected: ${sender.name || sender.id}`);
});

receiver.on('senderDisconnect', (sender) => {
  console.log(`[sender] disconnected: ${sender.name || sender.id}`);
});

// Recoverable problems. The receiver keeps running; log and move on.
receiver.on('error', (error) => {
  console.error(`[error] ${error?.message ?? error}`);
});

// Unrecoverable. Exit non-zero so launchd restarts us with a clean session.
receiver.on('terminate', (error) => {
  console.error(`[terminate] ${error?.message ?? error}`);
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`[daemon] ${signal}, stopping`);
  mirror?.stop();
  pairingService?.stop();
  clearTimeout(pairingRetry);
  clearPairing();
  try {
    await receiver.stop();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

let pairingService;
let pairingRetry;
clearPairing();
await receiver.start();
pairingService = receiver.getPairingCodeRequestService();
pairingService.on('request', clearPairing);
pairingService.on('response', (code) => {
  writePairing(code);
  console.log('[pairing] TV code ready. Run yt-cast --pair.');
});
pairingService.on('error', () => {
  clearPairing();
  console.error('[pairing] Could not obtain a TV code; retrying in 30 seconds.');
  pairingRetry = setTimeout(() => pairingService.start(), 30000);
});
pairingService.start();
console.log(`[daemon] running as "${deviceName}" — cast to it from the YouTube app`);

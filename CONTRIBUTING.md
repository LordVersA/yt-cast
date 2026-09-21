# Contributing

Thanks for taking a look. This is a small project, so the process is informal.

## Reporting a bug

Open an issue with:

- what you did on the phone, and what happened on the Mac
- the relevant part of `~/.yt-cast/daemon.log`
- `sw_vers -productVersion`, `node --version`, and your phone's OS
- whether `yt-cast --status` shows the state you expect

That last one splits the problem cleanly in half. If `--status` is right, the
receiver is fine and the bug is in the browser layer. If it's wrong or stale,
the problem is upstream of that.

Before filing, check whether the Lounge API simply changed — if casting stops
working for everyone at once, the fix belongs in
[yt-cast-receiver](https://github.com/patrickkfkan/yt-cast-receiver).

## Development

```bash
npm install
launchctl bootout gui/$UID/com.parsa.yt-cast   # stop the background service
npm run daemon                                 # run in the foreground
```

Running in the foreground is the whole debugging story: every state change,
mirror action and pairing event prints as it happens. `YTC_LOG_LEVEL=debug`
adds the library's own protocol logging.

Restore the service when you're done:

```bash
./install.sh
```

### Tests

```bash
npm test                                   # everything
node --test test/state.test.js             # one file
```

Running the suite needs **Node 22 or newer**, because it uses
`--experimental-test-module-mocks`. The daemon itself still runs on Node 18, as
`engines` declares, and CI keeps that honest with a separate smoke job.

The suite needs no phone, no browser and no network. `src/browser.js` is
replaced with `mock.module`, and the injected sync script is extracted from
source and evaluated against a fake `<video>` in a `vm` sandbox, so the real
page contract stays under test without driving Chrome.

Tests set `YTC_STATE_DIR` to a temporary directory before importing anything
that reads it. Keep that first in any new test file — the modules resolve the
path once at import time, so setting it afterwards is too late and the test
would write to your real `~/.yt-cast`.

The mirror tests are slow by nature: they wait on real 1s ticks.

To drive the player by hand:

```js
import RecordingPlayer from './src/player.js';
const player = new RecordingPlayer();
player.setLogger({ info(){}, debug(){}, warn(){}, error(){} });
await player.play({ id: 'jNQXAC9IVRw', context: {} }, 217);
await player.seek(45);
```

`setLogger` is needed because the framework normally injects one.

## Architecture notes

Worth knowing before changing things:

**The player never plays.** `RecordingPlayer` satisfies the framework's
`Player` interface but only records state. Every `do*` method returns `true` so
the phone believes it's casting.

**Position is extrapolated.** The phone reports a position on events only, so
`livePosition()` in `src/state.js` advances it by elapsed wall-clock time while
playing. Anything that needs "where is the phone now" goes through that, never
the raw stored number.

**The tab is the follower.** The mirror pushes state into the browser and never
reads intent back out. This keeps a single source of truth, at the cost of
making browser-side scrubbing pointless.

**Auto-open and sync are independent.** Opening a tab needs no JavaScript
injection; sync does. When injection is unavailable the mirror disables sync but
keeps opening tabs. Don't collapse these back into one flag.

**Seeking while paused resumes.** Upstream `Player.seek()` calls `resume()` when
the previous status was paused, so scrubbing a paused video starts it playing.
That is deliberate — it is how a TV behaves — and the mirror must not fight it.

**The state file is written atomically.** Writes go to a temp file and rename,
because the CLI can read at any moment.

## Style

Match what's there: ES modules, no build step, no framework. Comments explain
*why* something is the way it is, not what the line does.

Run `npm test` before opening a PR, and add tests for behaviour you change.

## Releasing

CI runs the suite on macOS against Node 18 and 22 for every push and pull
request to `main`.

A release is a version tag. `npm version` writes `package.json`, commits and
tags in one step, which keeps the tag and the version from drifting apart —
the release workflow refuses a tag that disagrees with `package.json`:

```bash
npm version patch     # or minor, major
git push --follow-tags
```

The tag push runs the tests once more, then publishes a GitHub release with
notes generated from the commits since the previous tag. Nothing is published
to npm.

## Pull requests

One change per PR, with a description of what it fixes and how you verified it.
If it touches the mirror or the receiver, say what you tested with — a real
phone, or a scripted player.

Contributions are accepted under the MIT license.

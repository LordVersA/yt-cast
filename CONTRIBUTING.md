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

### Testing without a phone

The player and mirror can be driven directly, which is how most of this was
built:

```js
import RecordingPlayer from './src/player.js';
const player = new RecordingPlayer();
player.setLogger({ info(){}, debug(){}, warn(){}, error(){} });
await player.play({ id: 'jNQXAC9IVRw', context: {} }, 217);
await player.seek(45);
await player.pause();
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

**The state file is written atomically.** Writes go to a temp file and rename,
because the CLI can read at any moment.

## Style

Match what's there: ES modules, no build step, no framework. Comments explain
*why* something is the way it is, not what the line does.

Run `node --check` on anything you touch. There is no test suite yet; if you
add one, `node --test` is the natural fit since it needs no dependencies.

## Pull requests

One change per PR, with a description of what it fixes and how you verified it.
If it touches the mirror or the receiver, say what you tested with — a real
phone, or a scripted player.

Contributions are accepted under the MIT license.

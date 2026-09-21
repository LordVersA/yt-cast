# yt-cast

Cast from your phone's YouTube app to your Mac browser. The video opens by
itself and stays in sync as you play, pause and seek on the phone.

```
$ tail -f ~/.yt-cast/daemon.log
[sender] connected: iPhone
[state] playing jNQXAC9IVRw @ 217s
[mirror] opened tab → https://www.youtube.com/watch?v=jNQXAC9IVRw&t=217s
[mirror] seek+pause
```

macOS only. MIT licensed.

## Why

You're watching something on your phone and want it on the big screen, but the
"big screen" is a laptop, not a TV. Every existing cast receiver sends video to
a *media player* — mpv, Kodi, Plex — which means no comments, no live chat, no
account, and ads you can't skip the usual way.

yt-cast sends it to **youtube.com in your normal browser**, signed in, with
everything the site normally gives you.

## How it works

Your Mac pretends to be a TV.

A background daemon speaks [DIAL](http://www.dial-multiscreen.org/) and the
YouTube **Lounge API** — the protocol behind the "Play on TV" button. It appears
in your phone's cast list like any smart TV, but it never plays anything. It
just records what the phone reports: which video, what position, playing or
paused.

A **mirror** then keeps a browser tab following that state. Once a second it
compares the tab to the phone and corrects drift over two seconds, matching
play, pause and seek through AppleScript. The tab is always the follower —
scrub in the browser and the next tick pulls it back to the phone's position.

```
phone (YouTube app)
   │  cast button → picks your Mac
   ▼
daemon  ── writes ──▶  ~/.yt-cast/state.json
   │                          │
   ├─ pretends to play        ▼
   │                      yt-cast ──▶ browser   (manual, on demand)
   └─ mirror ──── AppleScript ───▶ browser      (automatic, every 1s)
```

The phone thinks it's casting to a TV. You get a normal YouTube page.

## Requirements

- macOS (uses `launchd` and AppleScript)
- Node.js 18 or newer
- Google Chrome, for live sync. Other browsers get auto-open only.
- Phone and Mac on the same Wi-Fi

## Install

```bash
git clone https://github.com/<you>/yt-cast.git
cd yt-cast
npm install
./install.sh     # starts the daemon, runs at login
npm link         # puts `yt-cast` on your PATH
```

### Enable browser control

Live sync injects JavaScript into the YouTube tab, which Chrome blocks by
default. One time:

```bash
defaults write com.google.Chrome AllowJavaScriptAppleEvents -bool true
```

Then in Chrome enable **View → Developer → Allow JavaScript from Apple Events**
and restart Chrome. macOS will ask once for permission to control Chrome —
allow it.

Skipping this is fine. Auto-open still works; only play/pause/seek sync is off.

### Connect your phone

Open YouTube on your phone, tap the cast button, and pick your Mac. It appears
as `<hostname> (Browser)`. The phone remembers it after that.

If it doesn't show up, run `yt-cast --pair` and enter the code on your phone
under **Settings → Watch on TV → Enter TV code**.

## Usage

Once connected, casting is enough — the tab opens on its own. The command is
there for when you want it:

```bash
yt-cast                     # open the current video at the phone's position
yt-cast --status            # what the phone is doing right now
yt-cast --url               # print the URL, don't open anything
yt-cast --from-start        # open at 0:00 instead
yt-cast --pair              # show a TV code, when discovery fails
yt-cast --browser Firefox   # open in a specific browser
```

## Configuration

Environment variables, set in the launchd job at
`~/Library/LaunchAgents/com.parsa.yt-cast.plist`:

| Variable | Default | Meaning |
|---|---|---|
| `YTC_MIRROR` | on | `0` disables auto-open and sync; manual `yt-cast` only |
| `YTC_BROWSER` | `Google Chrome` | Browser to drive. Non-Chrome gets auto-open only |
| `YTC_NAME` | `<hostname> (Browser)` | Name shown in the phone's cast list |
| `YTC_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug`, `none` |
| `YTC_STATE_DIR` | `~/.yt-cast` | Where runtime state lives. Daemon and CLI must agree |

Restart after changing: `launchctl kickstart -k gui/$UID/com.parsa.yt-cast`

## Managing the daemon

```bash
tail -f ~/.yt-cast/daemon.log                        # logs
launchctl kickstart -k gui/$UID/com.parsa.yt-cast    # restart
launchctl bootout gui/$UID/com.parsa.yt-cast         # stop
rm ~/Library/LaunchAgents/com.parsa.yt-cast.plist    # uninstall
```

Log prefixes: `[daemon]` startup and shutdown, `[sender]` phone connections,
`[state]` what the phone reported, `[mirror]` browser actions, `[pairing]` TV
codes. Lines prefixed `[yt-cast-receiver]` come from the underlying library,
not this project.

## Troubleshooting

**The Mac never appears in the cast list.** Confirm both devices are on the same
network, then suspect AP isolation — many routers block multicast between
wireless clients, and some mesh systems separate 2.4GHz and 5GHz into different
segments. Use `yt-cast --pair` to bypass discovery entirely.

**The tab opens but never follows.** JavaScript from Apple Events is off. The
log says so once, with the fix. Restarting Chrome is required after enabling it.

**Nothing happens at all.** Check the daemon is alive:
`launchctl list | grep yt-cast`. A third column of `0` is healthy; anything else
means it's crash-looping, and the log will say why.

**`EADDRINUSE` on port 3000.** Something else holds the port — often a stale
copy of this daemon. Find it with `lsof -nP -iTCP:3000 -sTCP:LISTEN`.

**It worked yesterday and broke today.** The Lounge API is undocumented and
Google changes it without notice. Check
[yt-cast-receiver](https://github.com/patrickkfkan/yt-cast-receiver) for an
update.

## Known limitations

**Two audio streams.** The phone keeps playing its own audio alongside the Mac.
Mute the phone, or use it purely as a remote once the tab is up.

**Position drift.** The phone reports its position on events, not continuously.
Between events the daemon extrapolates with wall-clock time, so accuracy is
about a second while playing and exact when paused.

**Live streams.** These work, and you land at the live edge rather than a
timestamp. The mirror deliberately never seeks a live stream.

**Unofficial protocol.** Nothing here is a supported Google API. It can break.

**Dependency advisories.** `npm audit` reports moderate denial-of-service issues
in transitive dependencies (`decode-uri-component`, `uuid`) with no upstream fix
available. They are reachable only from your local network.

## Layout

| File | Role |
|---|---|
| `src/daemon.js` | Starts the receiver, handles signals and proxy re-exec |
| `src/player.js` | A `Player` that records instead of playing |
| `src/state.js` | Atomic state file, drift math, URL building |
| `src/mirror.js` | Decides when to open a tab and when to reconcile it |
| `src/browser.js` | AppleScript bridge: find tab, inject sync script |
| `src/pairing.js` | TV-code fallback when discovery fails |
| `bin/yt-cast.js` | The CLI |
| `install.sh` | launchd job |

## Tests

```bash
npm test
```

62 tests covering the drift math, URL building, the recording player, the
injected sync script and the mirror's decision logic. No network, no browser
and no phone: the browser layer is mocked and the sync script runs against a
fake `<video>` element. Tests write to a temporary directory, never `~/.yt-cast`.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgements

Built on [yt-cast-receiver](https://github.com/patrickkfkan/yt-cast-receiver)
by patrickkfkan, which does the genuinely hard part: speaking DIAL and the
Lounge API correctly.

## License

[MIT](LICENSE) © Parsa Radfar

# Changelog

What changed in each released build. The version here is the one the packaged
app reports and the one a `v*` tag publishes; `.github/workflows/release.yml`
lifts the matching section into the release notes, so this file is what people
read on GitHub.

Written for someone deciding whether to download it: what it does, and what it
does not do yet.

`## Unreleased` collects what has landed since the last tag. `release.yml` finds
its section by version number, so this heading is inert until it is renamed to
one.

## Unreleased

## 0.1.0

The first build anyone can download. It is an **engine**, not a game: it reads
models, maps, textures and sounds straight out of your own installation of
*Hogs of War* (2000) and ships none of them. Point it at a folder holding
`warhogs_.exe` the first time it starts.

### What is in it

- **The original's own main menu**, drawn from the game's own art and letters —
  the machine driving in, the plates flipping, the lamps and the dial. Read blit
  by blit out of the exe rather than eyeballed. ONE PLAYER is the door that
  leads anywhere.

- **The training ground, played.** CAMP's terrain with its own baked light and
  water, its props, its script — most of what the level carries is not on the
  ground when it opens and arrives as the tutorial reaches it — the parachute
  drop it starts with, the turn clock, and the sergeant talking you through the
  steps in the game's own text.

- **A pig you drive**, tank controls as in the original: walking pinned to
  ground of any steepness, a wall that grants a step-up and no more, swimming,
  falling and being thrown, jumping — and bridges and ramps that are walked up
  and over, which the original does with data this remake had to work out.

- **Weapons in hand.** The skill menu over what a pig is carrying, the model it
  takes out of the game's own archive, the aiming pose over the walk, the power
  gauge the exe scales a throw by. Guns fire, grenades arc and bounce on each
  surface's own friction, mines wait and click, TNT is placed and blows, and
  five contact weapons swing off the hand bone for real damage.

- **The dashboard**, the chase camera that fades what stands between you and the
  pig, the sky the map's own record picks, and the battle's sounds — including
  footsteps, which are the clip's own key-frame events on the ground's own
  material.

### What is not in it yet

- **No AI and no second player.** A map's other sides stand where they spawned.
  CAMP fields one pig, which is what the training ground carries; `pow.swapMap`
  in the devtools console opens the other 60 maps to walk around.
- **No multiplayer or options screens**, no escape menu, no pause, and no map on
  the dashboard.
- **Not everything is decoded.** A grenade's fuse and blast radius, the sink of
  a pig that cannot swim, and a bridge sounding like wood are the remake's own
  numbers rather than the game's, and each says so where it lives.

### Notes

- Two downloads, same build: an installer and the same app as a portable zip.
  Neither is code-signed, so Windows SmartScreen will want a "more info" click.
- The folder you point it at is remembered per user, not beside the binary, so
  an uninstall leaves it and a reinstall finds it.

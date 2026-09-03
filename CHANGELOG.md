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

- **Tanks can be climbed into and fired.** OASIS's six tanks, SNAKE's two troop
  carriers and BAY's amphibious launch are things a pig gets into now, through
  the same door a shelter uses. A tank hands over its own three weapons and its
  turret swings ninety degrees up — twice a pillbox's reach, though it cannot
  point below the horizon at all, so nothing downhill is a target. **They do
  not drive yet**, which also means they do not run anybody over and the
  carriers cannot pick anybody up.

- **A PILLBOX is a gun now, not just cover.** Climb into one and its own two
  weapons are in the menu — HEAVY M-GUN and FLAME THROWER, unlimited — and a
  pig at the gun turns to aim where before it could only sit. The barrel points
  through half the arc a pig manages on its feet, which is the price of the
  walls. Neither weapon is strong: eight points and four, against a rifle's
  twenty, and neither knocks anybody over. A pillbox is a cheap place to shoot
  from that nobody has to walk out of.

- **The second rank of classes plays.** The BOMBARDIER's **mortar** — a shell
  that bursts into three more, and whose ANGLE is its range, because it has no
  power gauge to hold — and the ENGINEER's and SNIPER's **suicide**, fifty
  points at the pig's own feet that it does not survive. Both were in shipped
  kits already and both did nothing at all when the fire key went down.

- **SUPER TNT works** — the game's biggest charge, two hundred points and a
  shove to match. It comes out of a crate, on four of the maps.

- **Crates that used to be empty hand something over again.** A quarter of the
  table that turns a crate into a weapon had been left out, which quietly
  emptied every crate carrying a jetpack, an air strike or a super TNT — the
  jetpack one stands on twenty-one maps.

- **A blast no longer throws pigs half across the map.** The knock is the
  original's own arithmetic now, which is about a quarter of the distance the
  remake was giving it — and a mine throws harder than a grenade, while a gas
  or a medicine ball throws nobody at all.

- **A thrown grenade no longer sits pinned to the middle of the screen.** The
  original's camera chases the flight rather than locking on to it, so a lob
  climbs out of the top of the frame and the view pans up after it.

- **The hospital tents pay out.** Spend a turn inside a MASH tent and your pig
  wakes at full health; a medic tent gives fifty points back. The plain tents
  and the shelter give nothing, which is what the original does too.

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
- **No multiplayer or options screens.** The escape menu, the pause and the
  dashboard's map are in.
- **Not everything is decoded.** A grenade's fuse and blast radius, the sink of
  a pig that cannot swim, and a bridge sounding like wood are the remake's own
  numbers rather than the game's, and each says so where it lives.

### Notes

- Two downloads, same build: an installer and the same app as a portable zip.
  Neither is code-signed, so Windows SmartScreen will want a "more info" click.
- The folder you point it at is remembered per user, not beside the binary, so
  an uninstall leaves it and a reinstall finds it.

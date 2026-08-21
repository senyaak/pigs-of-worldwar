# The enemy AI — the slice

Everything decided for the enemy AI, written down before any of it is built,
so that none of it has to be re-argued. Nothing in here is implemented beyond
the seat (`lib/game/ai.ts`, todo item 5): today's brain waits out the GET
READY card, stands thinking and passes. The rest is the plan and the reasons.

## The decision: our own brain, the original's rules

The original's AI was never decoded and will not be. The disasm repo carries
**zero** recovered decision logic — no targeting rank, no movement plan, no
weapon choice; its README promises "AI behavior notes" that were never
written. What it does carry is the rules the AI plays by, and those bind us:

- **The machine moves like a player.** The AI walk states push the same
  `0x40` request through the same `Pig::Walk` arithmetic — one speed, no
  analogue (`movement/notes.md`). No speed cheats existed and none will.
- **A hidden pig cannot be TARGETED.** `Team::BuildTargetList` (0x44A7D0)
  drops any pig with the HIDE flag up. This is what keeps the skill alive,
  and it is a hard rule at every brain level. Memory is another matter —
  below.
- **The AI avoided known mines** through a passability map of its own
  (0x461f60, unread). Same idea here, ours by design.
- **A bullet flies STRAIGHT for its lifetime, then falls** — range is
  `speed × life`, never stored (`weapons/fire.md`, 0x4aa0d0). There is no
  wind anywhere in the game. The brain's ballistics are exactly the engine's.

Beyond those, behaviour is ours to invent — the target is what the player
FELT: simple, honest, and meaner as the campaign goes on.

## The frame: a brain that holds the same gamepad

The no-cheating guarantee is structural, not disciplinary. The stack:

1. **The brain** (`lib/game/ai.ts` and satellites) sees the world only
   through a READ-ONLY facade — `TerrainQuery`, `Obstruction`, the pig list,
   `sightline.canSee` — and speaks only ORDERS: the `Order` union widened
   from today's `wait/begin/think/pass` into `{walk to}`, `{aim at}`,
   `{hold skill}`, `{fire charge}`.
2. **The actuator** (the machine block in `battle.ts`, 976..997) carries an
   order out through the SAME five verbs the player's input calls —
   `setIntent`, `setAim`, `setFiring`, `jump`, `enterBuilding` — under the
   same walk speed, the same aim rate, the same gauge-by-held-time, the same
   sights tremor, the same turn clock.

So the machine physically cannot out-drive a player, and what the brain
DECIDES and what the engine RESOLVES are two different things — the brain
decides off its own (deliberately imperfect) estimates, the world answers
with what actually happened, and an honest miss is born in that gap.

**Not the renderer's `Controller`.** It is the same five verbs wearing key
names — giving it to the AI adds nothing and drags the brain into the
presentation layer, which breaks the two things the seat was built for:
headless runs (`unit/`, `engine-headless`) and lockstep (`net` feeds this
seam on every peer, so the brain must be simulated identically everywhere).
The brain is separate LOGIC — module, facade, orders — inside the same tick.

**Determinism, restated from todo item 5:** the brain is a pure function of
stepped time and draws chance only from the battle's seeded stream. And one
trap with a name: when the brain DRY-RUNS a candidate shot (`advanceShot`,
`advanceLob` are pure — integrate and look), it hands the prediction a
THROWAWAY rng, or the lookahead eats the battle's stream and net diverges.

## The evaluation: one currency, the HP differential

There is no "medic behaviour", no "grenadier behaviour". One brain, one
score: enumerate pairs of **(kit item × target or point)** and take the best

    expected enemy damage − ally damage + ally healing + kill bonus − own risk

- **The kill bonus** is why killing one pig outright beats wounding two for
  the same total: a dead pig loses every future turn. 30 damage to two pigs
  at 30 hp each is worth more than 40 to one at 120.
- **The environment is damage.** Knockback (`flingSpeed` = 6 × points) into
  water, onto a mine, or off a height can be worth more than the weapon's
  own number, and pricing that fling is a smartness lever — the veteran
  shoves where the grunt shoots.
- **Water KILLS a pig that cannot swim** `[play]` — only COMMANDO and HERO
  ranks swim. In the score and in the pathfinder both: lethal for most,
  merely expensive for a swimmer.
- **Healing is just a kit item** whose "damage" lands on the ally side with
  a plus sign. A medic heals because his kit prices healing highest, not
  because he is a medic. Class flavour, if any is ever wanted, is a weight
  nudge by `pigClass` — never a separate behaviour tree.
- **Prerequisite gap:** the healing skills (52 HEALING HANDS, 17 MEDIC DART,
  33 MEDICINE BALL) have no effect in the engine yet — `heal()` is only
  called by crate pickups. The mechanic lands first, then the brain prices it.

## Difficulty: how well it thinks, never what it gets

No stat bonuses, no damage scaling, no extra hp — one brain with knobs:

| knob | grunt end | veteran end |
| ---- | --------- | ----------- |
| candidates weighed per think | 2–3 obvious | dozens of position × weapon × target |
| estimate error (range, charge, arc) | large | shrinks toward the tremor floor |
| horizon | shoot now | where do I STAND after, who reaches me |
| ally-splash accounting | line-of-fire only | full blast radius |
| clumping penalty | near zero | high — spread out, deny the grenade |
| memory of hidden pigs | forgets | remembers the spot |
| actuator noise | over-turns the aim, over-holds the gauge | near clean |

Low-level misses look ALIVE for free: the pig genuinely aimed with a bad
estimate and shaky hands, it did not roll a die and shoot at nothing.

**The ramp is per MAP, smoothly** `[play]` — every campaign position a
little smarter across all 25, even though the turn TIMER steps per island
(`turns.ts` keeps its own table). Arenas take a picked level.

## HIDE versus memory: armour, not invisibility

The hard rule stands at every level: no hidden pig in the target list. But a
human watches a pig turn into a crate in an open field and shells the crate
— splash needs no target. So the brain keeps a MEMORY of where enemies
vanished, and what it retains is priced by how much the disguise STANDS OUT
`[play]`: a crate where no crate stood is glaring; a bush among bushes is
nearly free. Noticing and retaining both sharpen with the level — HIDE works,
and works worse against a veteran, exactly like against a human.

## The pathfinder: ours, coarse, verified by the walk

There is none today and the original's is unread. The plan: a coarse A* over
tiles on `walkable`/`standOn`, costs carrying the score's own judgments —
known mines forbidden, water lethal per class, climbs dear — and the final
leg validated by the movement simulator (`movement.ts` `step`), so an order
to walk somewhere is an order the legs can actually carry out. No navmesh;
the maps are 64×64 tiles and the turn clock bounds the search.

## The passes

1. **Infrastructure, then a grunt.** Widen `Order`, build the actuator over
   the five verbs, the read-only facade, the pathfinder — then the baseline
   brain: nearest visible target, close to range, pick from the kit by the
   differential, do not shoot through a friend. Good enough to finish any
   map.
2. **Watch it, then tune it.** Play the campaign against it and turn the
   knobs per position: the ramp, the memory, the splash pricing, the
   spread-out penalty. The evaluation stays one function; passes only
   re-weight it.

`unit/ai.spec.ts` pins the brain headlessly (feed a world, assert orders);
`e2e/002/battle.spec.ts` watches a machine turn end to end.

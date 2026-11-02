# 0A. PLAYING THE REAL CAMPAIGN — what stands between us and mission 1

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Play asked on 2026-08-19: what is left before the first map can be loaded. The
answer turned out to be shorter than this list looks, because most of it is
already built — so this section says what was MEASURED that day, not what was
assumed.

**The map opens today.** `pow.swapMap('ESTU')` — position 1's own level —
loads with no errors and stands TWO squads on it: ours of three (which is what
`fieldedAt` gives position 1) and the French `GARLIC GRUNTS`, three, in skin 2.
So "the levels are not playable" was never about the levels.

**And so does the rest of the turn machinery.** `Game.endTurn` moves the acting
pig, then walks to the next side that still has anybody standing, turns the
turn number over and resets the clock (`lib/game/game.ts`). Both sides take
their turns from the same keyboard, which `e2e/002/battle.spec.ts` already
drives on LIBERATE. The verdict "one side left standing" exists
(`lib/game/endOfGame.ts`).

What is actually missing, in the order it is worth doing:

1. ~~**Every campaign map has to OPEN**~~ **DONE 2026-08-19, and the sweep
   found a real bug on the way.** All 59 names were opened one after another
   through `swapMap` in one run: **53 open, with not one console error
   between them**, and the six that refuse are the `GEN*` texture sets, which
   carry no spawn markers and are not maps. `main.ts` opens `nextMap(save)`
   now.

   **The bug was ROAD — mission 2 — and it was a confusion of two numbers.**
   The battle filtered a map's records by `SIDES_FIELDED`, which is 2 because
   two squads play, where the exe's own test asks how many PLAYERS the game
   has. The campaign is ONE. Measured over ROAD's POG: its five scripted
   markers, the player's own side, carry low byte 0x71 — only the first
   player bit — so asking for two dropped the whole squad, and the enemy's
   two four-player markers were promoted to ours because no surviving side
   carried the scripted bit. ROAD opened as a lone pair of pigs with nobody
   to fight, and `outcomeOf` would have called it won on the first handover.
   At one player it fields 5 against 3. Over all 59 maps exactly two read
   differently either way, ROAD and BOOM (the arena, whose four sides are the
   multiplayer set). `lib/game/muster.ts` carries `PLAYERS = 1` beside
   `SIDES_FIELDED = 2` now, and `e2e/002/spawns.spec.ts` pins ROAD.

2. ~~**The verdict does not know whose side is the player's**~~ **DONE
   2026-08-19.** `outcomeOf(training, ownStanding, othersStanding,
   targetsLeft)` now: our side down is `'lost'` whoever else is standing —
   the exe's own both-empty case is 2, not 3 — and the win asks OUR side up
   with the others' empty. Side 0 is ours because `spawnTeams` orders the
   side carrying the map's player bit first; `handOver` feeds it per-side and
   `e2e/002/endOfGame.spec.ts` pins the case that used to lie
   (docs/history/turns.md).

3. ~~**The SAVE's squad does not reach the field.**~~ **DONE 2026-08-19,
   both directions.** `mapSquads` takes an `OwnSquad` — the save's name and
   the first `fieldedAt(position)` pigs, each under its own name and
   rank-class — and the battle hands side 0's dead back as roster slots in
   the order they fell, which `main.ts` stamps on with `fall` before the
   debrief reads anything. `discardMission` stands the squad back up, so
   RETRY and EDIT SQUAD find it as the mission did; CONTINUE settles it as
   before. And since later the same day the board's two counts COUNT:
   `killed` carries the attacker, the battle tallies side 0's kills, and a
   win puts missions+1 and the kills on every fielded pig's record
   (`credit`, docs/history/status.md "THE BOARD'S TWO COUNTS COUNT").

4. ~~**A turn is 45 seconds on every map but CAMP.**~~ **DONE 2026-08-19.**
   The exe's turn table is indexed by the CAMPAIGN POSITION — `[0x51f17b]`
   is `team+0x53`, decoded in `pigmap/notes.md` — so `BY_MAP` in
   `lib/game/turns.ts` is now the composition of `CAMPAIGN` and the table:
   every campaign map by name, arenas on the 45 default,
   `unit/turns.spec.ts` pinning the corners.

5. **The AI's first brain PLAYS, 2026-08-21 — the GRUNT.** The design is
   [ai.md](../../ai.md) and the first pass of it is built: a brain decides ONE
   order when the hands are free (`lib/game/ai.ts` the seat's contract,
   `lib/game/orders.ts` the vocabulary), the actuator works the order out
   through the player's own inputs under the player's own speeds and clamps
   (`lib/game/actuator.ts`, `blocked` when the world refuses), and the
   battle's machine block FALLS THROUGH into the ordinary driving code —
   the pass is SKIP TURN fired like any skill. The GRUNT
   (`lib/game/grunt.ts`): gun out, close on the nearest foe to 0.6 of the
   gun's own range, step aside rather than shoot through a friend, turn,
   fire level; pass when unarmed or grounded out of reach. Pacing is the
   seat's, not the brain's (`AI_START_SECONDS`, `AI_MULL_SECONDS`).
   Deterministic throughout — stepped time, no chance drawn yet — because
   lockstep (the `net` branch) feeds this seam. Built since: the PATHFINDER
   (`lib/game/pathfind.ts` — binary directed world, bridge decks are roads,
   best-effort routes; the grunt walks its corners), aim PITCH (soles to
   soles, asked once), and the SEED of the HP differential — best gun by
   the damage table, best target by worth with the KILL_BONUS (a finishable
   foe outbids a nearer healthy one). The kit-wide PRICE LIST is in
   (`lib/game/evaluate.ts`, 2026-08-21): guns, blades and LOBS priced
   class-blind in one currency — the grenade's charge solved by dry-running
   the engine's own parabola (constant rng, the battle's stream untouched),
   the blast priced over EVERYONE including the thrower, which bought
   self-preservation out of arithmetic: at 800 units the grunt keeps the
   rifle because the grenade's rim (~1100) would bill him ~19 of his own.
   Built since: the PLANTED family (TNT is priced where the pig stands,
   self spared, and the FLEE is a behaviour), crates on the ledger against
   the greed knob, and the WITS dial itself (`lib/game/wits.ts`, 0..1 by
   campaign position, appetite its first customer). What is next, off
   ai.md's pass 1: the heals when the mechanic lands, the environment in
   the ledger (knockback into water/mines), and the next knobs on the dial
   (estimate error, actuator noise, memory). The pure specs and
   `engine-headless` stay hotseat: nobody is the computer unless the
   assembler says so — and `e2e/002/machine-mission.spec.ts` is the
   exception that proves the seat: ESTU, both sides handed to the machine,
   stepped headless to a verdict (~4.5 minutes of battle, five kills over
   thirteen shots — the grenades connect now that the fuse is watched every
   frame — one grunt left standing).

**~~NEXT UP — the thrown pig "rolls on the spot"~~ FOUND AND FIXED
2026-08-24.** The bench (measure-the-miss) cleared the flight itself — 1908
units over flat ground in 1.5 s — and indicted suspect 2 exactly: the settle
discarded 717 units a second of horizontal on the second touch, because the
landing test read only the NORMAL arrival. The exe was re-read to be sure and
says FULL magnitude: `di` at 0x4711d8 is `[hit+0x14]`, which the sweep fills
with the LENGTH of the relative velocity (0x407a44 → 0x418310, fsqrt of all
three), and the bounce arm's kick is `0x4a9260` — the ADD primitive — on top
of what the solver left, so the parallel part survives every contact and the
chain of low skips is the roll. Fixed in `fly()` (full-speed threshold on
open ground; BLOCKED ground keeps the normal test against the wall
slide-loop) and in `bounceOff` (friction charged as a RATE,
`keep^(delta/EXE_FRAME_SECONDS)` — at our 1/60 contacts a roll was dying
twice as fast as the exe's). Pinned in `unit/fling.spec.ts`: flat flight +
roll, downhill always gets away, into-the-slope still moves, and the whole
blast-on-a-hillside chain. The rest of the suspect list came up clean: the
bleed and the settle-under-375 are the exe's own, `tumbles.update` steps
unconditionally (engine.ts), and `obstruction.blocks` zeroing horizontal
near a body stays a known documented cost (lib/game/obstacles.ts).

**Play's open reports from the first AI session (2026-08-23), in their
order:**

1. ~~**The GRENADE: "до сих пор как-то странно отбрасывает — похоже ещё не
   очень работает взрыв."**~~ DONE 2026-08-23 — the suspect was the 45°
   toss: a blast now throws along the LINE from the burst to the body's
   centre of gravity (`hurlVelocity`, the exe's contact normal in spirit) —
   under the trotters is straight UP, per play's own spec: "чтобы свинья
   летала если граната ниже центра тяжести". The 45° stays the melee's,
   where it is read. Pinned in unit/blast.spec.ts (six geometries) and
   e2e/002/tumble.spec.ts. The hunt also caught two AI grenade bugs — the
   dry-run pricing throws that douse on water or fly to the seabed, and the
   1 Hz mull missing the detonation window as the grenade rolled past the
   foe (`AI_FUSE_SECONDS`) — details in docs/history/weapons.md. Play then
   caught the downward case (a blast above-and-behind froze the pig) and
   ordered the disasm — which went all the way: NEITHER original throws
   from a weapon blast (PC read exhaustively incl. zero indirect refs and
   no physics body on the effect; PSX SLES-01041 unpacked and read the
   same). The fling is `[play]`'s rule outright, its line the building
   blast's (the engine's only throwing explosion, both builds), and a line
   into the ground shoves FLAT along it. Full reads: weapons/fire.md and
   psx/notes.md in the disasm repo.
2. **The rest of the sound survey** — the P1 trio is wired (damaged/killed/
   shotLanded, commit 640d1df), and the 2026-08-24 pass took the TURN
   CLOCK's S_CLOCK warning, the blade's own I_SWMISS miss, the S_UNHOLS
   holster and the battle AMBIENCE with its two birds (audio/ambience.ts).
   **What is left is a list of NAME PICKS, not of wiring**: `broke` (props
   by bullet or blade), `chose`, `promotionPoint`, the parachute trio
   (`dropOpened`/`dropCut`/`canopiesCut` — P_CHUTE1 is the tear),
   `wentIn`/`cameOut`, `remains`, and the grenade's BOUNCE, which has no
   event yet. Each wants an ear on the bank before a line of code, which
   is why they sit here rather than in a commit. `I_METAL` is the odd one
   and waits on a question instead — see P2.
3. The ARENA wits picker (`ARENA_WITS` is a flat 0.5 until arenas grow a
   difficulty choice). Diagnosis has a real tap now (2026-08-23): every
   decision is announced on the bus as `aiDecided` — the ladder rung, the
   whole price list losers included, the last order's outcome WITH what
   refused it (stuck/water/clamp) — and the ui writes it to
   `_tmp/telemetry.log` as `[ai]`/`[ai:kit]` lines (ui/battle.ts). The
   headless `AI_LOG=1` tap stays for Node runs. First suspect it was built
   for: "второй свин тупит когда враги с разных сторон" — look for the
   winner flip-flopping between two level-priced foes in `[ai:kit]`, and
   for `turnTo` alternating bearings in `[ai]`.

**Play's reports from the second AI session (2026-08-23, evening) — the
session log is `_tmp/ai-session-2026-08-23.log`, and every AI item below was
DIAGNOSED from it, not guessed. ALL SIX BUILT the same evening (be9e659,
"The first telemetry-diagnosed AI package"); the record is in
`docs/history/turns.md`.**

1. ~~**Turning and walking must be fully separate.**~~ **BUILT 2026-08-23,
   then DELIBERATELY SOFTENED 2026-08-24 (388dd84, play's call).** The strict
   align-then-walk-straight version (two thresholds, `REALIGN` = π/8) read
   as a stutter in play — "повернулся — шаг — повернулся — шаг… тупил, пока
   время не кончилось" — so big turns happen on the spot and small elbows
   are steered THROUGH while walking. The why is written in the header of
   lib/game/actuator.ts; do not "fix" it back to the spec above.
2. ~~**The seat keeps deciding after the weapon spent the turn.**~~ **BUILT
   2026-08-23** — the seat stops asking the brain once `spent` is set
   (battle.ts, the NOBBY "крутился на месте" case is cited at the gate),
   with a live thrown grenade the one exception so the DETONATOR's fire key
   stays owed.
3. ~~**The mull between ROUTE CORNERS is a stutter, not a thought.**~~
   **BUILT 2026-08-23** — the mull threshold is 0 when the last order was a
   `walkTo` that finished `done`, so DEN's eleven legs chain corner to
   corner with no standing.
4. ~~**The pathfinder and the water guard disagree, and the pig loops on
   the seam.**~~ **BUILT 2026-08-23** — `guarded()` in pathfind.ts probes an
   eight-point ring at `WATER_PROBE + GRID_STEP/2` for a non-swimmer, so
   the grid refuses every cell the guard would; a swimmer keeps the plain
   half-cell test. The DEN `blocked(water)`→pass loop is the doc comment.
5. ~~**"Hopeless" needs a plan B before the pass.**~~ **BUILT 2026-08-23** —
   an unplayable winner falls back to the best playable candidate
   (grunt.ts, `playable` runs the route and asks reach from where it
   actually ENDS), then to `crateFallback` (evaluate.ts — nearest crate at
   full worth, no appetite discount, no limit), and only then `pass-nothing`.
6. ~~Telemetry housekeeping~~ **BUILT 2026-08-23** — the ui tap collapses
   consecutive identical decisions into "…the same, N more times"
   (ui/battle.ts); NOBBY's 110 `watch` lines are one line and a count.

Non-AI bugs from the same session, queued after the AI:

7. ~~**The death STILL starts at the blow, and the boots went missing.**~~
   **BOTH BUILT 2026-08-24.** The gate: `stageStill()` now counts the blow's
   own theatre (the swing, the firing clip on the acting pig, a pending
   crate), a riding corpse no longer holds `settling()` hostage — which was
   the deadlock that had forced the death BEFORE the wind-down — and the
   corpse waits out `DEATH_QUIET` (1 s, `[play]`'s "потом секунда") of
   uninterrupted stillness on top; the walk-away beat holds for any corpse,
   riding or playing, so the order is the exe's mode 13 → still → 16 →
   handover. The camera comes to the dying pig's FACE (the canopy's own
   face rig, `dyingWatch` in three/battle.ts) for the length of the clip.
   The BOOTS were never a placement bug: `spawn('BOOTS')` answered null
   because the model was in no POG and not in `SPAWNED_MODELS`
   (lib/game/ammo.ts) — one name added, plus `pow.debug.remains()` so a
   drawn pair is countable. "Анимация не та" is for play to RE-JUDGE now
   that the real wait sits in front of the WOUNDED pose. A wet death's
   boots still land where the SUNK body ended — below the bed — noted in
   the recon, unruled.
8. ~~**The weapon is not holstered after firing**~~ **BUILT 2026-08-24** —
   `endTurnBeat` holsters whatever is still in hand (aim overlay down with
   it), announces `holstered`, and S_UNHOLS is wired to it
   (audio/battleAudio.ts). WHERE the exe's own `Pig::HoldWeapon(0)` call
   sits after a shot is unread; the turn's end is the remake's moment.
9. ~~**A rifle shot does not SHOVE the pig it hits**~~ **READ AND BUILT
   2026-08-24** — 0x478710 read to its last arm (weapons/fire.md, the
   2026-08-24 section): every bullet path ends in `0x4A9260(0x30, pitch,
   bearing, 0)` — ADD 48 units/frame along the bullet's own line, a literal
   with no table field — plus state 5 and clip 39 BOUNCE unless already
   falling; the one gate is the body being gone (state 8). Built as
   `SHOT_SHOVE` (lib/game/bullets.ts) through the ordinary fling seam,
   pinned in unit/bullets.spec.ts. Read and NOT built (nothing fields
   them): the MG burst cap (edi=5, first round ×5), the stagger counter
   raise, kind 0x36's flag. The medic dart HEAL (kind 0x24) was on that
   list and is BUILT 2026-08-28 — `min(deficit, 0x1400)` with no shove,
   `Projectile.heal` + the `healed` arm in bullets.ts, pinned in
   unit/bullets.spec.ts — the MEDIC's level-2 kit work.
10. ~~**No WOUNDED bearing on a hurt pig**~~ **READ AND BUILT 2026-08-24**
    — the bands are ABSOLUTE points, not a fraction of max (0x3B8 has no
    movement reader): over 25 untouched; 10–25 walk ×2/3 and run clip 1;
    at/under 10 walk ×1/3, run clip 2, and the UNARMED idle is clip 29 —
    a drawn weapon overrides the stance (idle test 3 before test 8).
    Backwards, water and wall speeds exempt. `woundBand` (health.ts),
    `WOUND_SPEED` + clip picks (locomotion.ts), pinned in
    unit/locomotion.spec.ts; full read in movement/notes.md "The WOUND",
    which also corrects the old 0x467EC0 claim. Read and not built: the
    exertion counter (clip 29 doubles as "winded" at 250+), the gas
    bypass, the distance-driven anim cursor (flat 25 fps stays `[play]`).
11. ~~**The debrief should show MEDALS under the text**~~ **BUILT
    2026-08-24** — the token is `pcmedal` (FEBMP.MAD, 52×24) instead of the
    `vp` coin, SPECIAL BONUS row steps 54 to fit. Which art the ORIGINAL
    page shows is still unread (the exe spins `chars\propoint.mad`); the
    medal is play's word, `[CHECK — remake]` at the token.

**Play's reports from the fourth AI session (2026-08-24, `_tmp/telemetry.log`
12:00–12:09) — ALL FOUR ANSWERED the same day:**

1. ~~"Всё ещё сильно умный: пошёл через всю карту к тому кто почти умер."~~
   The log acquitted the kill bonus — it is already wits-scaled and gave
   GINGER only +2 (`s22` vs `s20`) — and convicted the FLAT approach tax:
   ten points for a 500-unit stroll and the same ten for the 11 800-unit
   march, so +2 won it. The toll went PER TILE (`TAX_PER_TILE`,
   `approachTax` in evaluate.ts), with `FAR_FLOOR` keeping a sliver of any
   positive worth so distance ranks options without arguing the only
   weapon out of existence.
   **CORRECTED TWICE THE SAME EVENING, and the second one is the model.**
   First: the toll was never play's ask — "я просил? нет — я говорил что
   тупые смотрят на ближайшую цель, а умные оценивают лучший результат
   независимо от расстояния и учитывают таймер" — so it was scaled by
   `1 − wits` and a clock discount added for the sharp end. Then play named
   the shape underneath: **"надо просто симуляцию всех вариантов и выбирать
   наилучший; чем умнее — тем правильнее выбирает; также чем умнее — тем
   лучше целится и стреляет."** Right, and the wits-scaled toll was the
   same fact said twice: walking costs TURNS. So the price list now costs a
   walk in turns and nothing else (`trueScore`, `TURN_DISCOUNT`,
   `turnsAway`, and `AiWorld.turnSeconds` handed in for it) — **no wits in
   the simulation at all**. Every difference between a clever pig and a
   stupid one is downstream and was already built: `MISJUDGE` and the DUMB
   EYE for how well it SEES the number, `AIM_WOBBLE`/`CHARGE_WOBBLE` for
   how well it then aims and holds the gauge. The three-place rule is
   written at the top of ai.md's difficulty section so a fourth is not
   invented again. Pinned in unit/evaluate.spec.ts.
   **And play named the better model the same day** — "я тупой = что ближе
   всего — ящик/свин — это моя цель; вижу цель — стреляю; чем умнее — тем
   больше свин думает" — built as THE DUMB EYE (`NEAR_POINTS` in grunt.ts):
   the judgment ADDS `(1−wits)·60/(1+tiles)` to every live option, so at
   wits 0 the nearest interesting thing dominates the election (crates
   included — `FAR_FLOOR` reaches them now, a crate at the trotters used to
   die of its own flat tax before the eye could see it) while the kit still
   sorts by damage at one target, and at wits 1 only the arithmetic speaks.
   One superseded pin rewritten (the dull pig "skipping" a crate with
   nothing else to do was the old model). Pinned both ways in
   unit/grunt.spec.ts.
2. ~~"Пролаги пока свин думает — выгрузить в нод процесс?"~~ MEASURED
   first (headless, per-frame): average 0.13 ms, ONE frame at 130 ms — the
   turn's first `[hold]` decision, and the cost was the pathfinder's
   thirteen water-texel probes per cell over a cross-map A*. A battle-long
   per-cell WATER MEMO (pathfind.ts, `WaterMemo`) cut the worst frame to
   27 ms with zero over 40; TWO `[perf]` lines land in the telemetry now —
   `engine.update` over 40 ms, and any whole-frame GAP over 100 ms — so
   the next report says WHERE the stall was, engine or elsewhere
   (render/GC/IPC). Play's caution stands until a session shows clean:
   "не факт что пасфайндинг сам по себе — совокупность факторов?" — the
   half-second he saw was plausibly SEVERAL routes in one frame (the
   playable-fallback can run one per candidate), which the memo also
   collapses, but the tap is what settles it. A NODE
   PROCESS was deliberately NOT taken here — "it buys nothing at 27 ms" —
   and **that verdict did not survive contact**: the 27 ms was the memo's
   effect on a cold PROBE, not on a plan, and the tap went on printing
   400–538 ms `engine.update` frames for a fortnight afterwards. **BUILT
   2026-09-07**, down the road this very item named: "the brain is a
   PLAYER", its ORDERS as inputs. `src/brain/`, and the 09-07 entry in
   `docs/history/turns.md`.
3. ~~"Третий свин стрельнул через гору — пуля попала в землю."~~ The gun's
   pricing never asked the terrain. `clearShot` (evaluate.ts) samples the
   line every 128 units at the exe-ish muzzle height; a blocked shot
   scores 0 — visible in `[ai:kit]` — and the grenade (whose dry-run
   already flies over hills) takes the election. Pinned in
   unit/evaluate.spec.ts, both with and without a grenade to fall back on.
4. ~~"Медаль не та — там прям сам объект с карты стоять должен."~~ The
   debrief's token is the map's own PROPOINT model now, rendered once into
   a strip of sixteen yaw frames (three/tokenArt.ts) and blitted SPINNING
   on the page's own tick; `pcmedal` stays only as the fallback for a
   failed load. Framing/spin rate `[CHECK — remake]`.

**The THIRD session's log (`_tmp/ai-session-2026-08-23b.log`, 23:43–23:47,
~27 min AFTER be9e659) and a FIFTH session (`telemetry.log`, 15:03–15:09 on
the 24th) — both triaged 2026-08-24, and the triage found real work:**

~~First, a fact about the evidence itself: `src/main/telemetry.ts` TRUNCATES
`_tmp/telemetry.log` at every app start~~ **FIXED 2026-08-24 (play's order:
"каждая сессия свой файл")** — the tap writes `_tmp/telemetry-<stamp>.log`,
one file per app start, nothing ever truncated. The fourth session's
12:00–12:09 lines were already gone when this was found — the reasoning
survives above, the log does not. Every battle now opens with a `[battle]`
line naming the map, the mission title and both squads with their pigs
(ui/battle.ts), because both sessions had to be identified by matching raw
spawn coordinates; and `hp` prints rounded.

The AI package holds where it was tested — telemetry collapse works in both
logs, zero `blocked(...)` anywhere (the water seam is closed), no decision
thrash — but the logs put SIX new things on the list, in the order they
are worth doing:

1. ~~**A full-power throw VANISHES, twice — the spent-turn gate is not
   complete.**~~ **DIAGNOSED AND FIXED 2026-08-24 (929026b), and the seat
   was never guilty.** The sixth session's triage showed the brain DID
   decide every frame — all identical `watch`, silently collapsed, and the
   turn ended before the flush. What failed was the RESTING bar: it is the
   renderer's (15 u/s, "never quite stops rolling"), so a missed throw
   crept about until its own fuse beat the press. The brain has its own
   bar now — `SETTLED` = 60 u/s (grunt.ts), `world.thrown` carries the
   speed — a creeping grenade is down, press. GERARD's other case (no
   watch at all) is likely a DOUSED throw: the water's verdict now writes
   a `[lob] doused` line, so the next log says so instead of "vanished".
2. ~~**`[perf]` reopens the WaterMemo verdict.**~~ **SETTLED 2026-08-24 —
   and the ARCHITECTURE is chosen.** The sixth session (two walk orders)
   logged zero `[perf]` lines; all six spikes sit on `decide()`'s own
   `route()` calls, so the cost is per-plan, not per-frame. Play chose
   the road: "выложить в НОД процесс — как раз хорошо для сетевой игры,
   что НПС будет ходить на хосте и думать там" — which is exactly the
   "brain is a PLAYER" design already written down at the fourth
   session's item 2: the brain runs OFF the engine's step (worker or
   host process), its ORDERS become inputs on the net's own input path,
   so it need not be deterministic at all. **BUILT 2026-09-07, and it did
   NOT wait for the `net` worktree.** The "≤107 ms hitch" this line rested
   on was out by four times: one suite run of 2026-09-07 carries TWELVE
   `engine.update` frames between 400 ms and 538 ms, one per plan, and play
   was watching the picture stop for about a second every time a pig
   thought. `docs/history/turns.md`, the 09-07 entry.
3. ~~**The elected option is not the top-believed one for a whole
   turn.**~~ **DIAGNOSED AND FIXED 2026-08-24 (929026b) — the election
   was honest, the DISPLAY lied twice.** The head order provably carried
   out the starred row (the blast landed on its target). (a) The kit
   sorted on `judged ?? score`, but `judge` runs only on each slot's own
   winner, so judged rows ranked against raw ones — sorted by TRUE score
   now, belief still after the tilde. (b) A held plan (`intent`,
   deliberately never re-elected) looked identical to a fresh election —
   the kit line says `(plan held)` now, `Thought.held`.
4. ~~**Nobody moves after firing, and it kills them.**~~ **BUILT
   2026-08-24** — play ruled the shape and it is the ruling that made it
   small: self-preservation is a WITS behaviour, and the move is not "run
   away" but standing NEXT TO an enemy pig so a shell at you risks their
   own ("встать к нашему свину — так это только умные должны делать").
   `SHELTER_WITS` (0.5) and `SHELTER_NEAR` (240) in lib/game/grunt.ts: a
   smart pig's stand-off mark becomes a body's width off its target
   instead of the weapon's own shy fraction. GUNS only — the price list
   already scores a lob at arm's length below zero — and BOUNDED by
   `SHELTER_FROM` (four tiles), because unbounded it would march a pig
   across the map and be arguing with the approach tax. Pinned both ways
   in unit/grunt.spec.ts; the knob is on ai.md's table.
5. ~~**The grenade outranges the map, which moots the approach tax.**~~
   **ANSWERED 2026-08-24 — the range is the exe's own, and the pitch
   already matters.** Play asked "зависит от наклона — щас вроде верно
   кидается?" and the read says yes: the throw is `[exe]` end to end —
   `speed = row.speed·charge >> 12` (300/frame at full), plain gravity 10
   a frame², pitch splitting the speed (grenade.ts `lob()`), so
   `R = v²·sin(2θ)/g` and a full 45° throw carries **9 000 units ≈ 17.6
   tiles** — frame-rate cancels, and it equals the rifle's 9 000 exactly,
   which reads as the original's own design. The measured 6 000–8 000 is
   UNDER that ceiling because the AI solves CHARGE to the target's
   distance — demand-limited, not inflated. The player aims the pitch
   freely (start 0x200 = 45°, clamp ±1023, grenades not floored) and gets
   the whole `sin(2θ)` curve. **The one remake-own piece is the AI's
   fixed 45°** (evaluate.ts dry-run hardcodes aim 512; only guns got
   `aimTo`) — the original's grenade AI is not in the disasm at all.
   **And the pitch-aware AI is BUILT the same day, play's order: "для
   умных — подстраивание для точного попадания — но только для умных".**
   From `TUNE_PITCH_WITS` (0.5) up, the dry-run walks a ladder of
   come-ups — 45°, 56.25°, 67.5°, 78.75° — re-solving the charge per
   rung and keeping the one that lands nearest the foe; the ladder stops
   at the first landing within 64 units, so flat ground never climbs past
   45° and a dumb pig's cost is unchanged. A steeper arc both CLEARS a
   ridge the flat one dies on and REACHES a foe behind it the flat arc
   priced as out-of-arc. The option carries `aim`, the grunt takes it
   with the guns' own `aimTo` seam, the ballistics untouched. Pinned both
   ways (ridge and flat) in unit/evaluate.spec.ts; the knob is on
   ai.md's difficulty table.
6. ~~**The plan-B branch is still untested in play.**~~ **ANSWERED by play
   2026-08-24 — not a bug**: the branch never fired because a weapon was
   always playable ("потому что бежал стрелять всегда — я ж не могу
   заставить ящик идти поднимать"), which is exactly the ladder's design:
   the crate is a NECESSITY, not a preference, and a session where
   nothing reaches is what would exercise it. Stays a watch item, not
   work. Small residue on item 3's chaining still stands: corners emit an
   occasional sub-tile leg (384 units) wedged between two long ones,
   each costing a full decision.

**Play's batch, 2026-08-24 evening — the rest of it, after the fixes above
landed (929026b and the music commit):**

1. ~~**PIG VOICES are read end to end and wait to be BUILT**~~ **BUILT
   2026-08-24**, and with them both music tails. The voice is the pig's
   NAME-ROW identity — name k always speaks Pig{k+1} — and the language
   is `Team::SkinOf(nation)`, so a side barks in its own tongue out of
   the EN/AM/FR/GE/RU/JA sets: a pig carries its voice from muster (its
   place in the nation's nine; a DRAFT falls back on its slot), the
   bark/dying/turnBegan events carry it, and all three rotations are per
   PIG as the exe keeps them. Lard falls back to English — TL ships no
   files and our roster has no origin nations — `[deliberate]`.
   **Track31 plays at the end of a mission** (the training ground gets
   the sergeant's sign-off instead, 0x48fb08) and **Track27-30 stings a
   supply crate down**; the sting's other site, reinforcements falling
   due, has nothing in the remake to fire it, and Track32 has no caller
   anywhere. `unit/pigVoice.spec.ts`.
   Still not carried, and nobody can hear it: the exe SAVES a pig's place
   in its rotations with the campaign, so a mission opens where the last
   one left off. Ours start fresh each battle (`[gap]`).
2. ~~**The SECOND pig opens its walk with a wasted micro-leg**~~ **FIXED
   2026-08-24 (0cb609e)** — the cause was the pull's HORIZON, not its
   line test: `PULL` bounds the spine lookahead at 24 cells, so the
   3400-unit straight leg was never even tried against the 405-unit
   stair corner. A second pull pass runs over the CORNERS (few, cheap,
   unbounded per pair) and eats any corner whose neighbours see each
   other straight.
3. ~~**MISSION SELECT — wants play's word before building.**~~ **The
   screen already EXISTED (built 2026-08-24 earlier the same day) and
   play's reports are all in (0cb609e)**: boot camp is no longer a row
   ("тренировку туда не пихай"); EVERY real mission 1..25 is listed and
   a locked one wears the frontend's own OFF grey, carries no pair and
   refuses the choice; the record counts completion + survival + pickups
   now (`missionScore` — the old pickup-only records get their
   completion point floored in at `parse`), printed over
   `2 + bonusPoints`; and the MOUSE works — `#missions` was missing from
   the panel CSS rule, so the canvas geometry never matched
   `mouseRows`'s hit test. The replay flow banks the same composition.
4. **The detonator became a PLAN the same evening (0cb609e)** — play on
   the SETTLED fix: "разбор до нажатия — траектория уже должна быть у
   мозга, и каждый кадр рассчитывать всё это по пизде пойдёт с
   кластерной гранатой". Right: the dry run's own flight time now rides
   the option (`flight`), the brain stamps the press at FIRE — wobble
   scaled in once, `PRESS_GRACE` on top — and the thrown arm is a clock
   plus the near-a-foe window. `resting`/`SETTLED` remain only as the
   fallback for an unplanned throw.
5. **Watch next session**: the `[lob] doused` line (was GERARD's vanished
   throw a water landing?), the `[turn]` handover lines, the 2-second
   collapse flush, whether the press lands on the plan, and GINGER's
   opening leg now going straight.


**MISSION SELECT and the coin fly-in — BUILT 2026-08-24 (play's order of the
same afternoon).** The squad screen carries a second plate, SELECT MISSION,
opening the replay list on LOAD GAME's furniture: completed missions only,
name LEFT, the `vp` token and `taken/available` PP on the right, scrolling
past eight. A replay goes straight to the briefing, never moves the
campaign, and its CONTINUE banks only what beats the position's record
(`best` in lib/game/save.ts — parse repairs older files). And the AWARD is
the exe's own COIN SHOW, read the same day (0x4196E0 family, notes in the
disasm repo): points fly onto the `pigpro` pile one coin per five frames on
a jittered damped spring, the counter climbing one per landing to COINFLIP;
a promotion's spend runs it backwards to COINDROP. `[CHECK — remake]`: the
`vp` art over the exe's untextured quad, the sparkle trail unbuilt, the
second plate's y. The 2026-08-21 BACK-to-menu change had left four e2e/001
specs walking the old chain — caught here because nobody had run the phase
on a fresh build since; they walk the current rules now.

Not blockers for mission 1, though the lists carry them: the pillbox's two
weapons and the vehicle (section C), skill 63 MAP VIEW, the PROPOINT tokens
(`bonusPoints(1)` is 0 — the first mission pays none), the empty power-gauge
slot, and the three arch bridges that are fallen through (ESTU is not one).

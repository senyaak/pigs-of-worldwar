# The map's limit, and a thrown pig's way home

- `[exe]` **The line is ±12288, the same on every map.** ±0x3000, compiled into the
  walk, a fixed inset of eight tiles. What a map builds on it varies, and 27 maps,
  ESTU among them, build nothing. `terrain/boundary.md`. `WORLD_LIMIT`,
  `lib/game/terrain.ts`.
- `[exe]` **It holds one pig: the acting one, and only until its turn ends.** Every
  ±0x3000 test of a pig's own move sits behind that gate: on foot 0x478D32, in the air
  0x46D57D. In the air that pig is put at ±12256 and stilled, and falls from there
  (0x46D5B2..0x46D721). `heldAtLimit`, `lib/game/locomotion.ts`.
- `[exe]` `[play]` **A blast throws any pig past it.** No other pig is ever held, and
  a blow on the acting pig ends its turn at once (0x467C6B), so its own blast throws it
  out too. Play, 2026-08-26: "там можно чтобы взрывом отбросило за проходимую границу
  вроде - но потом обратно свин сам бежит."
- `[exe]` **Out there it stands fifty frames, on the ground, and then comes home.** The
  counter runs from the landing, 0x46CE84, about three and a half seconds. The acting
  pig goes only in mode 13 (0x46CE8D). A hit restarts the counter (0x467BF4), and a
  blow also ends a walk under way (0x467C47). `lib/game/walkHome.ts`.
- `[exe]` **Home is the water's own search**, `Pig::MakeForShore` 0x472DD0: eight rays
  of sixteen tiles, tiles outside the box skipped, a wall inside it ending the ray,
  water passed over, the nearest wins and its tile's centre is the target. A ray that
  found nothing still competes, so near the map's low corner the pig comes home in hops
  that double. `homeFrom`, `water/notes.md`.
- `[exe]` **The walk is its ordinary walk.** It turns on the spot at the driven pig's
  rate, then runs along the bearing at its own speed with its own wounded cycle, 16 a
  frame in water, 4 up a wall tile, and stops on the first step back inside on dry,
  clear ground (0x46DD22..0x46E10A). It cannot be wedged (0x46FF91). An object is
  `TryMove`'s, step up and then sidestep (`movement/step.md`), and one it can do neither
  to ends the walk and it looks again; ground falling away is a fall.
- `[exe]` **The end of a turn waits for it.** `[0x537FC0]` is the first test of the wait
  (0x495288). `settling` and `stageStill`, `lib/game/battle/waits.ts`, ask
  `walkHome.waiting()`. In the exe a blow on the acting pig is mode 13 at once; here it
  is `spent`, cashed on the quiet after it, so the acting pig is left out of the count
  until the beat runs, or the quiet would wait for a walk only the beat can start.
- `[deliberate]` **The search's accept is the remake's own `blocks`**, a pig's body at
  the tile's centre. The exe's 0x478B80 sweeps a box of 256 by twice the pig's height.
- `[gap]` **A pig standing in the water out there** waits for the walk-away beat to swim
  home, where the exe's water search starts it after five frames in any mode but the
  acting pig's. `lib/game/walkAway.ts`, which aims at the pig's own offset in the shore
  tile rather than the centre.
- `[gap]` **The three ways the exe kills it are senyaak/pigs-of-worldwar#32:** past
  ±15871 at once (0x46CF10), still out after 500 frames (0x46CEDC), no ray finding a
  tile (0x4730D5). Until then each takes the training ground's arm of the first two: x
  and z clamped to ±12288 (0x46D0B5..0x46D17C), so the pig is put on the line, alive,
  and the turn goes on. `putOnTheLine`, `lib/game/walkHome.ts`; `flightStep`,
  `lib/game/locomotion.ts`.
- **The AI's grid does not move with this.** `lib/game/pathgrid.ts` is derived from the
  line, which is why its plans sit on ±12032: the grid's own corner, not a map edge.

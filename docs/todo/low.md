# LOW — the odd corners, and play's ruling on each (2026-08-21)

Written down because they were raised in one sitting and answered in one:
**"запиши всё в туду как лоу - потом посмотрим если надо будет."** Nothing
here is scheduled. Each carries what play said, because on four of the six
the ruling changes what the work IS.

- **`FT_WOOD` is a KNOCK ON WOOD** — `[play]`, and it settles the footstep
  divergence rather than leaving it a guess. Over all 61 shipped maps there is
  **not one tile of type 2 or 3**, so two arms of `Pig::Footstep`'s twelve-way
  switch are unreachable and the file ships unplayed: the original crosses a
  deck to the sound of the ditch. `lib/game/underfoot.ts` already gives the
  bridge pieces their own material by NAME, and this says that is the right
  sound to be giving them.
- **`wat01`/`wat02` and the DLL's 49×49 grid are WATER TEXTURES** — `[play]`:
  "просто на пс1 их не было, на пк добавили - потом попробуем." So the open
  question is closed, and what is left is an experiment rather than a read.
  The remake draws one flat see-through sheet (CLAUDE.md); trying the two grey
  TIMs on it is a session of its own and play wants it later.
- **The tile turn's DIRECTION** — `[play]`: "плохо читал." The disassembly
  composes to a forward shift and the shipped maps say backward over 883 steep
  tiles, and the residual was blamed on an unfound v-convention flip in the
  TIM → page path. That is not an answer, it is a shrug. Read it again
  properly before touching the table, which is pinned byte by byte in
  `e2e/000/terrain-viewer.spec.ts`.
- **The IDLE CYCLE wants decoding** — `[play]`: "ну так надо расшифровать."
  A standing pig loops clip 27 and nothing else. The 80-byte table at 0x4D7300
  that a spent repeat count steps into is per-WEAPON, not per-pig, which is why
  an unarmed pig falls straight through it; what a pig does while it stands
  about is behind the exe's own "Choosing idle anim from scratch" string and
  nobody has followed it.
- **The FISH do not swim** — `[play]`: "они вроде не плавают а стоят на 1
  месте." 292 records across 13 maps at heights 160..432. They are dropped from
  the collision world by the two-unit rule (lib/game/obstacles.ts) and drawn
  like any other prop, so if they are standing still that is already faithful.
  Nothing to do unless play sees them moving in the original.
- **The three specs the CLASS KITS turned red are MINE** — `[play]`: "ну это
  ты сломал спеки когдато - тыж весь код пишешь." They were handed back as an
  open question and should not have been. `CLASS_KIT[0]` gives a grunt the
  bayonet, so `crate.spec:116`, `crate.spec:154` and `trainingStep.spec:124`
  fail, and the tutorial's first step leaves a GRENADE in hand instead of the
  blade. Decide it in the code and fix the specs with it.
- **The AIRSHIPS are in the data.** `EN_BIP` is the sound play named — "дережабли
  летают на картах" — and the POG carries **`BIGLOONY`, six records, all on
  LUNAR1**, at heights 1440..1984. `three/props.ts` draws by name off the map's
  own archive, so they are probably already drawn and simply silent. Open
  LUNAR1 before assuming anything is missing.
- **The TEXT OBJECT is read whole (2026-08-28, text/notes.md) and ui/font.ts
  matches it only where the plates needed it.** Built the same day: the ×2
  battle stretch and the heart-glyph justification. STILL OPEN, each one
  measured and waiting: escape parsing (`/C` mid-string colour, `/N`
  newline at 22, `/S`, `/Z…)`, `//` — our draw prints them as literal
  glyphs); the frontend's THREE-ATLAS shading (avg<50 → chars2D, >100 →
  chars2L — our `painted` multiply is the battle's mechanism applied to
  the frontend, where the exe never modulates); space advance carries no
  tracking (ours adds 3 — every frontend space 3 px wide of the exe's) and
  `measure` should drop one trailing tracking; alignment/box/wrap modes;
  the half-texel bias; diffuse ALPHA on battle text; the frontend 2D
  list's REVERSED draw order. None of it urgent — the menus were tuned by
  eye against the originals' screens — but any future "the text looks off"
  starts at this list, not at a new read.

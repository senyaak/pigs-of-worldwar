// What the battle's waits ask: whether the acting pig has COMMITTED to a blow,
// whether the WORLD is still doing something, and whether the STAGE is still
// enough for a death to start playing out.

import type { BattleCore } from './core'

/**
 * Whether the pig has COMMITTED to a blow, and so cannot be driven at all.
 *
 * Everything from the frame the FIRE button goes down to the frame the last
 * thing it threw has gone: the gauge charging, the fuse and the flight, the
 * swing itself, and anything still in the air. The exe's walk refuses from
 * the moment the button goes down until the clip is spent (0x46afd5 tests
 * both the pending flag and the animation one), and `Pig::MayAct` is false
 * through the whole of a shot (lib/game/shot.ts).
 *
 * **`sighting` is deliberately NOT in here**, and it was for one commit.
 * Going down the sights does not take control away — it hands over a
 * DIFFERENT control set, which is the exe's own branch at 0x4928dc. Play
 * named the distinction: "там должен включаться другой контрол сет;
 * выключаться должно когда выстрел нажал, не прицел."
 */
export const committed = ({
  shots,
  grenades,
  swings,
  heals,
  pockets,
  hides,
  sacrifice,
  attack
}: BattleCore): boolean =>
  attack.busy() ||
  swings.running() ||
  // …and the laying-on of hands, for the length of its own clip — the same
  // hold `[pig+0x2FF]` puts on any attack animation (lib/game/healing.ts).
  heals.running() ||
  // …and the tiptoe, for its clip's own length (lib/game/pickpocket.ts).
  pockets.running() ||
  // …and the disguise's gesture, whose end is where the pig vanishes
  // (lib/game/hide.ts).
  hides.running() ||
  // …and the last resort's, whose end is where the pig does
  // (lib/game/suicide.ts).
  sacrifice.running() ||
  // THROWN, not planted: a charge lying at the pig's feet is exactly what it
  // has to be able to run away from (lib/game/lobs.ts `thrown`).
  grenades.thrown() > 0 ||
  shots.live().length > 0

/**
 * Whether the WORLD is still doing something — what every one of the exe's
 * waits is waiting for (`0x415420`'s fifteen QUIET frames, lib/game/aftermath.ts).
 *
 * Play named the set: a projectile still in the air, damage still landing, a
 * body still coming apart, a crate still under its canopy. Whatever the battle
 * can answer for goes in here, and all three waits — the beat after a blow, the
 * beat at the end of a turn, and the turn a weapon has SPENT — ask the same
 * question, which is why it is one function and not three copies of a list.
 */
export const settling = ({
  shots,
  grenades,
  mines,
  effects,
  numbers,
  tumbles,
  corpses,
  airDrops,
  walkHome,
  state
}: BattleCore): boolean =>
  // …and first of all a pig outside the line, standing or on its way home:
  // `[0x537FC0]`, the first test of the wait (0x495288, lib/game/walkHome.ts).
  walkHome.waiting() > 0 ||
  effects.busy() ||
  shots.live().length > 0 ||
  grenades.live() > 0 ||
  // A mine that has been trodden on and has not gone off yet: four tenths of a
  // second, and nothing may hand the turn over inside it (lib/game/mines.ts).
  mines.live() > 0 ||
  // …and a pig still in the AIR, which is what a blast leaves behind
  // (lib/game/tumble.ts). Play watched what leaving it out costs: "динамит
  // не толкает", because TNT's six-second fuse runs out inside the beat
  // that ends the turn, and a beat that does not wait for the flight hands
  // the turn on before the pig has moved a unit.
  tumbles.live() > 0 ||
  // …the ACTING pig's own flight included — it lives on `loco`, not in
  // `tumbles` (see `fling`), and a beat that could not see it ended with
  // the pig still in the air, so the sergeant and the END OF GAME both
  // began under a flying pig. Play: "матч кончается только после всех
  // анимаций — стейт машина поломана похоже".
  state.loco.airborne !== null ||
  // …and its GET-UP: the landing is the flight's last act (`flyOn`), and a
  // beat that could not see it cut the rise short at the handover.
  state.loco.getUp > 0 ||
  // …and a DEATH whose dying is actually PLAYING — the clip, the sink, the
  // boots (lib/game/corpses.ts). The exe's list asks the same (`0x47D800`,
  // no pig still busy), and it is what keeps the camera on a kill until the
  // body has finished coming apart. A RIDING corpse is deliberately NOT in
  // it: it is motionless, and counting it here held the turn's wind-down —
  // the aftermath beat, the spent turn, the WALK AWAY — hostage to a death
  // that was itself waiting for the wind-down to finish. That circle is
  // exactly why the dying used to start at the blow: the wind-down could
  // only run AFTER the death, so the death could not wait for it.
  corpses.playing() > 0 ||
  state.loco.airborne !== null ||
  // …and a pig part-way through climbing INTO a building: the clip runs 17
  // frames and the turn must not be handed over on top of it
  // (lib/game/buildings.ts, `INOUT_CLIP`).
  state.climbing !== null ||
  numbers.live() > 0 ||
  airDrops.falling() > 0

/**
 * Whether the STAGE IS STILL — nothing left in flight, nobody swimming for
 * the shore — which is the moment a death may start PLAYING OUT
 * (lib/game/corpses.ts). Play named the beat and the exe's turn-mode table
 * agrees with the order: "сначала идёт урон, потом когда все остановились,
 * выплыли из воды — тогда только идёт анимация умирания" — mode 13 WALK
 * AWAY, mode 14 WAITING FOR ALL OBJECTS TO STOP MOVING, and only then 16
 * WATCHING DYING PIG (0x4d72b0; the state-6 arm at 0x46f4ef rides the
 * physics body until then).
 *
 * NOT `settling`: that list waits on the deaths that are PLAYING
 * (`corpses.playing()`), and a death that waited on it would deadlock the
 * beat. This is the same list LESS the deaths and the PICTURES — the smoke
 * and the floating numbers are not motion, and the exe's own hold is
 * `0x47D800`, a walk over the PIGS. The blow's own theatre — the swing,
 * the firing clip, the crate a broken thing still owes — IS in it, since
 * play's second report: with none of it counted a plain shot's stage read
 * still in the step of the hit. On top of the stillness the corpse then
 * waits out DEATH_QUIET (lib/game/corpses.ts) — the "потом секунда".
 */
export const stageStill = ({
  game,
  anim,
  shots,
  grenades,
  mines,
  swings,
  tumbles,
  airDrops,
  walkHome,
  state
}: BattleCore): boolean =>
  walkHome.waiting() === 0 &&
  shots.live().length === 0 &&
  grenades.live() === 0 &&
  mines.live() === 0 &&
  tumbles.live() === 0 &&
  state.loco.airborne === null &&
  state.climbing === null &&
  airDrops.falling() === 0 &&
  // …nor while the blow's own theatre is still on — the swing's arc, the
  // firing clip on the acting pig, a crate still owed to a broken thing.
  // Play's second report said why these belong here: a plain shot mid-turn
  // had NOTHING in the list above by the time the damage landed, so the
  // stage read still in the very step of the hit ("умирание происходит
  // сразу же после попадания").
  !swings.running() &&
  !anim.animating(game.currentPig) &&
  state.pending === null &&
  (state.walkAway === null || state.walkAway.swimming() === 0)

// How big a model is in the world.
//
// A VTX vertex is not a world unit. Every body the original creates — the
// map's objects and the pigs alike — is built with a per-axis scale, and
// that scale is HALF.
//
// The chain, all in `warhogs_.exe` and `Data/_d3d.dll`:
//
//   - the body constructor (0x45de90) stores its last three arguments at
//     `+0x60`, `+0x64`, `+0x68`;
//   - those three dwords are handed straight to the library's `afScaleObj`
//     (0x45e443, through the import slot at 0x538114 the exe fills by
//     `GetProcAddress`);
//   - `afScaleObj`'s unity is **4096** — the engine's 1/4096 fixed point,
//     the same one the angles and the friction values use — and the eight
//     sites that pass it push `0x1000` exactly;
//   - every other site pushes `0x800`. There are 86 of them against those
//     8, and they are the POG loader (0x4a5a52, 0x4a5ac0, 0x4a5be1 — the
//     same records whose x/y/z it reads at `+0x20`/`+0x22`/`+0x24`) and the
//     pig code (0x4704ee, 0x46c0c3).
//
// 2048/4096 = 0.5. Not a number fitted to a screenshot — a literal pushed
// 86 times.
//
// The POG's collision box follows it: the extents match a model's bounding
// box exactly, so the count's world value is half of what a 1:1 reading
// made it — 64, not 128 (`formats/pog.ts`). A pig's marker says 5x5x5,
// which is 320 units, and the grunt model is 651 tall halved to 325. That
// is not a separate change; a collider that did not follow would sit
// twice the size of the art it belongs to.
//
// It ALSO offers a resolution to `HEIGHT_SCALE` — the exe doubles the PMG
// heights in three verified places and the remake does not, because a
// doubled map "read as stretched" next to a pig twice the size it should
// be. That is written up where the knob lives (`lib/game/terrain.ts`) and
// deliberately NOT acted on: it changes the terrain, which is a different
// decision from the size of a model.
//
// The check that says it out loud: CAMP's training ground paints a red
// square on the ground, texture 36 of `CAMP.PTG`, whose blob covers 18x20
// texels of 32 — 288 x 320 units on a 512 tile. In the original's own
// footage a crate sits on one of those squares with red showing all round
// it. CRATE1's model is 380 wide: 1.32 squares at 1:1, and 0.66 of one
// here.
export const MODEL_SCALE = 2048 / 4096

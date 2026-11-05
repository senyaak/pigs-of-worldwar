# B18. THE LEVEL-2 CLASSES ARE FINISHED — built 2026-09-01, and what is still dead beside them

Play: "давай второй уровень классов доделаем? медик уже вроде как более менее
работает — осталось ещё 3". Counted against `CLASS_KIT` and `attack.ts`'s
ladder, the three were **BOMBARDIER, ENGINEER and SNIPER**, and between them
they wanted exactly **two** skills: **28 MORTAR** and **51 SUICIDE**. The
MEDIC's own pair landed 2026-08-28 and everything else in those four kits was
already built. Both are in now — read first (`weapons/cluster.md`,
`weapons/suicide.md`, `weapons/level2.py` in the disasm repo), then built;
`docs/history/weapons.md` has the session.

**The failure mode they had is worth naming, because three skills still have
it.** A skill with no row in any of the four tables falls through `attack.ts`
to the melee default, which answers `false` for anything without a blade — so
the fire key did NOTHING, spent no round, ended no turn and said nothing. It
was reachable in play: the mortar is in two shipped kits. Still like that:

- **31 AIRBURST** (kits 3, 4, 14, 15, 16) — and it is worse than inert, because
  `weapons.ts` gives it `power: 1`, so the HUD draws a gauge that can never
  fill. Every number is read (B16 above, `cluster.md`): five 20-point
  sub-shells off a 40-point CONTACT blast. It is now a small job — the mortar's
  `Lob.scatter` is the same shape with `count: 5` and an upright.
- **50 JETPACK** (kits 4, 14, 15, 16) — no row anywhere, and its camera mode
  0x0A is read and not built either. Not a projectile at all: it is movement,
  and nothing has been read for how it flies.
- **32 SUPER AIRBURST** — the same as 31 plus two whole airburst shells, read
  and unbuilt; nothing carries it.

And **8 RIFLE BURST / 9 MACHINE GUN still fire one round a press**: the MG
burst cap (edi=5, first round ×5) is read and unfielded, which leaves 9 strictly
worse than the rifle. **10 HEAVY M-GUN and 14 FLAME THROWER are short the same
way** (#201): a press looses eleven and seventeen rounds on that same cap
(`weapons/fire/burst.md`, 0x479BD0), and the remake looses one at the row's own
figure. And **13 SUPER SHOTGUN wears the shotgun's knock of 6 a pellet** (#202),
where the 6 is kind 0x12's alone and 13 adds 48 (0x478A92,
`weapons/fire/hit-by-projectile.md`). The gun bench pins all of them
(`e2e/000/proving-bench-guns.spec.ts`). `18 TRANQUILLISER DART` flies and hurts like a rifle round
with no tranquillising behind it — there is no stun status in the engine, only
`poison.ts`.

**Two things this left open on purpose.** SUICIDE's camera mode **2** (7500,
level) is still not built, so blowing yourself up moves nothing but the shake —
one row of `chase.ts`'s table the day it is wanted. And the AI never picks
skill 51: `evaluate.ts` prices guns, lobs and blades, and what a machine pig
should be willing to spend itself FOR is a rule nobody has given.

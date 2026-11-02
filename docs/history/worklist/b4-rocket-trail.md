# B4. The rocket is drawn crooked, and it wants its own trail — DONE 2026-08-11

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Play, twice: "прожектайл кривой при выстреле базуки… также шлейф — своего рода дым
такой белый."

**The nose is MEASURED.** `WE_BAZZ` out of the map's own archive (which is where a
fired rocket's art comes from) is thirteen vertices with its long axis on **Y**,
−196..191, and **one** vertex at the −196 end against six at +191 — an apex over a
hexagonal body. So the nose is model **−Y**, and the pose is that axis turned onto
the velocity rather than the yaw-and-pitch pair that assumed +Z.

**And the trail is the ENGINE's — effect id 0x14.** A first pass answered "the exe
hangs nothing on a bazooka" off two dispatches; play refused it flat ("ВРЁШЬ!!!")
and was right. The projectile's UPDATE has **two** per-kind dispatches and the
pass read the wrong one: 0x436596 sends every kind outside 26..28 to 0x436727,
where the map at 0x436D68 is indexed by the KIND straight and kind 10 lands on
0x43676D — `new(0xE4); push 14h; push esi; 0x487620(…)`, the same parented-effect
call the grenade's constructor makes with 0x15.

**And it corrected the grenade with it.** `[0x48BF90 + id − 1]` → `[0x48BF24 +
slot*4]` puts id 0x14 on 0x48B024 (÷6, particle 0x16) and id 0x15 on 0x48B0F5
(÷3, particle 0x19) — so the "six a frame" every note called the grenade's is the
ROCKET's, and a grenade lays three. `LOB_TRAIL` is fixed to match.

**And it is the engine's end to end** — a first pass shipped a white, double-size
row off play's "белый густой дым" and play sent it back: "давай делаем как в
движке — в этом же и суть." Both trails share one particle setter, so the row is
grey 0x4210 at size 8 like a grenade's and the COUNT is the only difference; six
against three is the whole of "густой". If it still reads as nothing in play, what
is wrong is the PUFF — our canvas blob against the original's textured additive
particle — and that is the thing to change, not the row.

The same dispatch settles the BULLET: kinds 12..17, the guns, take `push 15h` —
the grenade's own id — so a bullet really does lay a grenade's trail, which this
engine had right by accident and for the wrong reason.

Read and not built: effect 0x14's Init lays one particle of type 0x14 at the
spawn point, same grey at size 0x10 — a bigger puff where the rocket leaves the
barrel.

**The lesson, and it is the one already written down**: "I could not find it" is
never "it is not there". Two dispatches read is not the same as the site read.

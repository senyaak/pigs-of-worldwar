# B2. TNT's blast is too big to get clear of — DONE 2026-08-11, and nothing was tuned

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Play: "у динамита радиус слишком большой — я отхожу задом все 4 секунды, а меня
всё равно задевает на 4 урона." Measured off the old numbers, they were about
**2400** units out when they took those four points.

**The rim is the RANGE.** `0x48CBA0` is a ramp from a 512-unit core to a QUARTER
at exactly `past = range` — "never to nothing", which is the rim the exe draws.
This engine went on evaluating that line past its own divisor to where it crosses
zero, `512 + 4·range/3`, and used THAT as the reach. The gap is the range's own
size, which is why only TNT was ever complained about: a grenade loses under a
hundred units by the correction and TNT loses four hundred, so at 2400 there is
now nothing at all.

**And the falloff's third term is read** — the one docs/history/weapons.md called "a float
nobody has read". `[[body+0x18]+0x4C]+0x0C` (0x48CC46) is the STRUCK BODY's own
collider radius, out of the shape table its body comes from: 0xAA for a pig,
riding `MODEL_SCALE` here like every other body length.

**What is still NOT found is WHO** — and one candidate is now ruled out by
measurement. `Pig::OnHit`'s blast arm is reached from a physics CONTACT with the
effect's own body, and the shape table (0x4A90CC, eleven entries) gives an effect
a sphere of **35**: 205 units against a pig, inside the falloff's own core, where
it could never be anything but full damage. So something grows that contact and
it has not been read. The other candidate is DEAD: `[pig+0x180]`, which the
projectile's ±0x400 sweep sets, has exactly two readers and both are in the
ANIMATION picker (0x46F457, 0x4721B7) — they put clip 0x21 on, so a pig with a
live projectile within a tile of it **cowers**. Nothing about damage.

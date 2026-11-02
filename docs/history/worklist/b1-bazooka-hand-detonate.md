# B1. A bazooka can be hand-detonated like a grenade — DONE 2026-08-11

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

`Lobs.detonateNow` skips a row with `contact` set: a rocket has no fuse to cut
short (row +0x14 nil starts it in state 2, which nothing counts down — what ends
it is touching something, 0x437F2C). The press is still swallowed, so F during a
rocket's flight does nothing at all, which is the same "one blow a turn" rule
everything else follows.

*(What this entry used to say, kept for the control-set half, which is unchanged:
`weaponLayer(29)` is `'lob'`, so the second press is offered — and it is now
offered to something that refuses it.)*

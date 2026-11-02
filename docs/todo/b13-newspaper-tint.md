# B13. The NEWSPAPER's tint is wrong, and the tinting itself reads senseless — 2026-08-26

Play, after mission 2: "газеты кстати както странно красятся - у меня красныйм
хотя я за синим. и закрашение не имеет смысла." Two halves:

- the page came out tinted RED for a player on the BLUE side — whatever drives
  the colour (`lib/game/newspaper.ts` / `ui/newspaper.ts`) is picking the wrong
  side's, or the wrong number entirely (nation vs skin vs slot is the usual
  trap — lib/game/nations.ts);
- and play questions the tint AT ALL — check what the original actually does
  to the page before fixing the colour: the right answer may be no tint.

Recorded to fix later; nothing touched yet.

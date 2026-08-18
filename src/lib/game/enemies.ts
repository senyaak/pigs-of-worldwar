// WHO EACH MISSION IS FOUGHT AGAINST — decided ONCE, when the team is born.
//
// The original rolls the whole campaign's enemies at `Team::Create` (0x482940,
// `army/notes.md`): five rounds of five rolls, `rand() % 6` rejected while the
// nation is already used more than the round allows or is the player's own —
// so every OTHER nation appears a balanced five times across the campaign —
// and then position 25, FINAL, is overwritten with nation SIX: **the last
// mission is always TEAM LARD**. The mission-select never touches the table;
// the launcher just reads it back.
//
// Position 0 — the training ground — has no entry in the original (the writer
// and the reader are off by one, and nothing writes its slot); the launcher
// takes `(own + 1) % 6` there instead (0x41A409). This module stores that
// fallback IN the slot, so the table is dense and the save carries one array.


/**
 * The campaign's enemy table, indexed by POSITION 0..25. `rand` is a source of
 * [0, 1) — the renderer hands `Math.random`, a test hands something seeded
 * (`lib/game` itself never reaches for chance, docs/testing.md).
 */
import { LARD, NATIONS } from './nations'

export { LARD }

export function drawEnemies(own: number, rand: () => number): number[] {
  const enemies: number[] = [(own + 1) % NATIONS]
  const counts = Array.from({ length: NATIONS }, () => 0)
  for (let round = 0; round < 5; round++) {
    for (let k = 0; k < 5; k++) {
      let nation: number
      do {
        nation = Math.floor(rand() * NATIONS) % NATIONS
      } while (counts[nation] > round || nation === own)
      counts[nation]++
      enemies[5 * round + k + 1] = nation
    }
  }
  enemies[25] = LARD
  return enemies
}

/**
 * Fill a campaign's enemy table back in where it is SHORT.
 *
 * A save written between "the campaign gets its spine" and "the enemies are
 * drawn at birth" carries `enemies: []` — and an empty array passes the
 * parser's own test, so the save loads and every position on the pig map
 * reads nation 7, the brown "none". Play saw the whole map in one colour.
 *
 * The repair keeps whatever the table already says — those entries are the
 * nations already fought — and draws the rest, so a campaign in progress
 * keeps its history and gains a future.
 */
export function fillEnemies(own: number, enemies: number[], rand: () => number): number[] {
  if (enemies.length > 25) return enemies
  const drawn = drawEnemies(own, rand)
  return drawn.map((nation, position) => enemies[position] ?? nation)
}

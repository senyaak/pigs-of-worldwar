// The console IS the sound editor, the same way it is the layout editor.
//
// Most of `BATTLE_SOUNDS` is a NAME pick — the exe refers to a sound by index
// and only a handful of its call sites have been read, so a jump, a landing
// and a splash wear whatever the bank's own names suggested. Play's verdict on
// those was "щас прям они не очень", which is the only verdict that can settle
// them, and picking off a list of 99 file names is not how it gets settled:
// a sound has to be heard in the moment it belongs to.
//
// So:
//
//     pow.sfx.list()            // every name in the bank, with its index
//     pow.sfx.list('P_')        // ...filtered
//     pow.sfx.play('P_LAND1')   // hear one, by name or by index
//     pow.sfx.now()             // which sound each moment currently uses
//     pow.sfx.set('jump', 'P_JUMP2')   // rebind it and hear it at once
//     pow.sfx.print()           // the table, to paste back into battle.ts
//
// A rebind is live: everything reads `BATTLE_SOUNDS` at the moment it plays,
// so the next jump uses the new one. Nothing here persists — `print()` is
// what carries a decision back into the source.

import { BATTLE_SOUNDS } from './battle'
import type { Bank } from './bank'

/** One row of the listing, so the return value is useful and not just the log. */
export interface SoundRow {
  index: number
  name: string
}

export interface SoundConsole {
  list(filter?: string): SoundRow[]
  play(which: string | number): string | null
  now(): Record<string, string>
  set(moment: string, name: string | number): string | null
  print(): Record<string, string>
}

/**
 * Build the console surface over a bank. `bank` is asked for rather than held
 * because the battle loads it beside the scene and swaps it in when it
 * arrives — the same reason everything else in this folder takes a getter.
 */
export function createSoundConsole(bank: () => Bank): SoundConsole {
  /** A name, an index, or something that is neither. */
  const resolve = (which: string | number): string | null => {
    const names = bank().names()
    if (typeof which === 'number') return names[which] ?? null
    return bank().has(which) ? which : null
  }

  return {
    list(filter) {
      const wanted = filter?.toUpperCase()
      const rows = bank()
        .names()
        .map((name, index) => ({ index, name }))
        .filter((row) => !wanted || row.name.toUpperCase().includes(wanted))
      for (const row of rows) console.log(`${String(row.index).padStart(3)}  ${row.name}`)
      if (rows.length === 0) console.log(filter ? `nothing matches ${filter}` : 'the bank is empty')
      return rows
    },
    play(which) {
      const name = resolve(which)
      if (!name) {
        console.warn(`no such sound: ${which}`)
        return null
      }
      bank().play(name)
      return name
    },
    now() {
      for (const [moment, name] of Object.entries(BATTLE_SOUNDS)) {
        console.log(`${moment.padEnd(10)} ${name}`)
      }
      return { ...BATTLE_SOUNDS }
    },
    set(moment, name) {
      if (!(moment in BATTLE_SOUNDS)) {
        console.warn(`no such moment: ${moment} — try pow.sfx.now()`)
        return null
      }
      const resolved = resolve(name)
      if (!resolved) {
        console.warn(`no such sound: ${name} — try pow.sfx.list()`)
        return null
      }
      BATTLE_SOUNDS[moment] = resolved
      // Hearing it is the point of setting it.
      bank().play(resolved)
      return resolved
    },
    print() {
      for (const [moment, name] of Object.entries(BATTLE_SOUNDS)) {
        console.log(`  ${moment}: '${name}',`)
      }
      return { ...BATTLE_SOUNDS }
    }
  }
}

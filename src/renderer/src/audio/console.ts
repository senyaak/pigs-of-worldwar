// The console IS the sound editor, the same way it is the layout editor.
//
// Part of `BATTLE_SOUNDS` is still a NAME pick, and a name pick cannot be
// corrected off a list of 99 file names — the sound has to be heard in the
// moment it belongs to. Play's verdict on the movement ones was "щас прям они
// не очень", which is the only verdict that settles them.
//
// (The jump, the landing and the slip were settled a different way: play
// named P_SNORT1 for the jump, that led to the exe's own call site, and the
// landing and the slip came out of the same sweep. Reading beats guessing
// where reading is possible — `../pigs-disasm/anim/audio-events.md`.)
//
// So:
//
//     pow.sfx.list()            // every name in the bank, with its index
//     pow.sfx.list('P_')        // ...filtered
//     pow.sfx.play('P_LAND1')   // hear one, by name or by index
//     pow.sfx.now()             // which sound each moment currently uses
//     pow.sfx.set('jump', 'P_SNORT2')            // rebind it, and hear it
//     pow.sfx.set('land', 'I_PICKUP', {pitch: 120})  // ...with a mix too
//     pow.sfx.print()           // the table, to paste back into battle.ts
//
// A rebind is live: everything reads `BATTLE_SOUNDS` at the moment it plays,
// so the next jump uses the new one. Nothing here persists — `print()` is
// what carries a decision back into the source.

import { BATTLE_SOUNDS, playCue } from './battle'
import type { Cue } from './battle'
import type { Bank } from './bank'

/** A cue as the source spells it, so `print()` output pastes straight in. */
const show = (cue: Cue): string =>
  `{ sound: '${cue.sound}', volume: ${cue.volume}, pitch: ${cue.pitch}` +
  (cue.jitter === undefined ? ' }' : `, jitter: ${cue.jitter} }`)

/** One row of the listing, so the return value is useful and not just the log. */
export interface SoundRow {
  index: number
  name: string
}

export interface SoundConsole {
  list(filter?: string): SoundRow[]
  play(which: string | number): string | null
  now(): Record<string, Cue>
  set(
    moment: string,
    name: string | number,
    mix?: { volume?: number; pitch?: number; jitter?: number }
  ): string | null
  print(): Record<string, Cue>
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
      for (const [moment, cue] of Object.entries(BATTLE_SOUNDS)) console.log(`${moment.padEnd(10)} ${show(cue)}`)
      return { ...BATTLE_SOUNDS }
    },
    set(moment, name, mix) {
      const cue = BATTLE_SOUNDS[moment]
      if (!cue) {
        console.warn(`no such moment: ${moment} — try pow.sfx.now()`)
        return null
      }
      const resolved = resolve(name)
      if (!resolved) {
        console.warn(`no such sound: ${name} — try pow.sfx.list()`)
        return null
      }
      cue.sound = resolved
      // Both scales are the exe's percentages of nominal, so they are set the
      // way they are read and the way `print` writes them back.
      if (mix?.volume !== undefined) cue.volume = mix.volume
      if (mix?.pitch !== undefined) cue.pitch = mix.pitch
      if (mix?.jitter !== undefined) cue.jitter = mix.jitter
      // Hearing it is the point of setting it.
      playCue(bank(), cue)
      return resolved
    },
    print() {
      for (const [moment, cue] of Object.entries(BATTLE_SOUNDS)) console.log(`  ${moment}: ${show(cue)},`)
      return { ...BATTLE_SOUNDS }
    }
  }
}

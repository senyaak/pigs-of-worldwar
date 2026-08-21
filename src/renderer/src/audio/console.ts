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
// where reading is possible — `anim/audio-events.md`.)
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

import { BATTLE_SOUNDS, placedSounds, playCue } from './battle'
import type { Cue } from './battle'
import { SILENT } from './bank'
import { context, sfxOut } from './bank'
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

/** What a WALK hands back: stop it, or ask where it got to. */
export interface SoundWalk {
  stop(): void
  /** What is sounding right now, or null once it has finished. */
  at(): string | null
  /** Everything it has played so far, in order. */
  heard(): string[]
}

export interface SoundConsole {
  list(filter?: string): SoundRow[]
  play(which: string | number): string | null
  /**
   * **WALK the bank**, hands-free: every matching sound in turn, each held for
   * its own length plus a breath, its name logged as it starts.
   *
   * Paced by the SAMPLE rather than by a fixed gap, because the lengths run
   * from 0.06 s to 4.26 s and a fixed gap either runs them together or leaves
   * dead air. `pow.sfx.walk('L_')` is the launches, `walk()` is all
   * ninety-nine. It returns a handle — `stop()` ends it.
   */
  walk(filter?: string, opts?: { gap?: number; fresh?: boolean }): SoundWalk
  /**
   * …or step it by hand: a GENERATOR over the same list. `next()` plays the
   * next one and hands back its row, so an ear that wants to sit on one sound
   * is not fighting a timer.
   */
  each(filter?: string, fresh?: boolean): Generator<SoundRow, void, unknown>
  /**
   * What has NOT been heard yet — every name the bank has played, dropped.
   *
   * An ear working through ninety-nine of them stops and starts, and starting
   * again from the top is the whole of what makes it a chore. `fresh` on the
   * walk and the generator is this same list.
   *
   * It counts anything the BANK played, the game's own noises included — which
   * from the menu is nothing, and inside a battle is a reason to browse from
   * the menu.
   */
  left(filter?: string): SoundRow[]
  /**
   * **ONE MORE, each time you ask** — the generator kept for you, so nothing
   * has to be held in a variable and the console's own up-arrow is the whole
   * interface. `pow.sfx.next()` plays the next unheard sound and prints where
   * it has got to; null when the list runs out.
   *
   * The list is taken once, when the stepping starts, and again whenever the
   * filter changes or `rewind()` is called.
   */
  next(filter?: string): SoundRow | null
  /** Start the stepping over. */
  rewind(): void
  /**
   * **ANY audio file in the install, by path** — because the battle bank is
   * not all there is.
   *
   * The install holds 2019 audio files and the three `.srl` banks name 126 of
   * them. Play walked the battle's ninety-nine looking for a burning fuse and
   * came out with "короче там ничего нет - но звук фитиля точно где-то есть
   * ещё", which was right: `FESounds/` carries `hiss1`, `hiss2`, `Sparks02`,
   * three steams and two coins, and the FRONT END is the only thing that
   * plays them.
   *
   * `pow.sfx.file('FESounds/hiss1.wav')`. Paths are relative to the install
   * and it decodes each one once.
   */
  file(path: string): Promise<string>
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
/**
 * `pow.sfx`, installed from the APP's own start rather than from a battle —
 * the same arrangement `pow.sarge` has, and for the same reason: most of the
 * sound table is a name pick and only an EAR settles one, so the browsing must
 * not require a mission to be open.
 *
 * A battle installs its own over this when it opens; both point at the one
 * shared bank (audio/bank.ts), so it is the same list either way.
 */
export function installSoundConsole(load: () => Promise<Bank>): void {
  if (!window.pow) return
  let loaded: Bank = SILENT
  void load().then((bank) => {
    loaded = bank
  })
  window.pow.sfx = createSoundConsole(() => loaded)
}

export function createSoundConsole(bank: () => Bank): SoundConsole {
  /** A name, an index, or something that is neither. */
  const resolve = (which: string | number): string | null => {
    const names = bank().names()
    if (typeof which === 'number') return names[which] ?? null
    return bank().has(which) ? which : null
  }

  /** The rows a filter matches — what both the walk and the generator step
   * through, and the same test `list` uses. */
  const matching = (filter?: string, fresh?: boolean): SoundRow[] => {
    const wanted = filter?.toUpperCase()
    // What has SOUNDED this run, and what was settled long before it — the
    // second is the half that survives a restart (audio/battle.ts).
    const heard = fresh ? new Set([...bank().played(), ...placedSounds()]) : null
    return bank()
      .names()
      .map((name, index) => ({ index, name }))
      .filter((row) => !wanted || row.name.includes(wanted))
      .filter((row) => !heard || !heard.has(row.name))
  }

  /** Where `next()` has got to: the list it is walking and the filter it was
   * built for. */
  let stepping: { filter: string | undefined; rows: SoundRow[]; at: number } | null = null

  /** Files played by path rather than by bank, decoded once each. */
  const loose = new Map<string, AudioBuffer | null>()

  return {
    async file(path) {
      const ctx = context()
      if (!ctx) return 'no audio context'
      if (ctx.state === 'suspended') await ctx.resume()
      if (!loose.has(path)) {
        const got = await window.api.loadSound(path)
        if (!got.ok) {
          loose.set(path, null)
        } else {
          try {
            const bytes = new Uint8Array(got.data)
            loose.set(path, await ctx.decodeAudioData(bytes.buffer as ArrayBuffer))
          } catch {
            loose.set(path, null)
          }
        }
      }
      const buffer = loose.get(path)
      if (!buffer) return `no sound at ${path}`
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(sfxOut() ?? ctx.destination)
      source.start()
      return `${path}  ${buffer.duration.toFixed(2)}s`
    },
    left: (filter) => matching(filter, true),
    rewind() {
      stepping = null
    },
    next(filter) {
      if (!stepping || stepping.filter !== filter) {
        stepping = { filter, rows: matching(filter, true), at: 0 }
      }
      const row = stepping.rows[stepping.at]
      if (!row) {
        console.log('nothing left')
        return null
      }
      stepping.at++
      bank().play(row.name)
      console.log(
        `${String(row.index).padStart(3)}  ${row.name}   (${stepping.at}/${stepping.rows.length})`
      )
      return row
    },
    walk(filter, opts) {
      const gap = opts?.gap ?? 0.4
      // Taken ONCE, at the start: the walk plays as it goes, so a list that
      // re-read itself would drop everything it had just done.
      const rows = matching(filter, opts?.fresh)
      const played: string[] = []
      let now: string | null = null
      let stopped = false
      void (async () => {
        for (const row of rows) {
          if (stopped) break
          const seconds = await bank().seconds(row.name)
          if (stopped) break
          now = row.name
          played.push(row.name)
          console.log(`${String(row.index).padStart(3)}  ${row.name}  ${seconds.toFixed(2)}s`)
          bank().play(row.name)
          await new Promise((done) => setTimeout(done, (seconds + gap) * 1000))
        }
        now = null
      })()
      return {
        stop() {
          stopped = true
          now = null
        },
        at: () => now,
        heard: () => [...played]
      }
    },
    *each(filter, fresh) {
      for (const row of matching(filter, fresh)) {
        bank().play(row.name)
        console.log(`${String(row.index).padStart(3)}  ${row.name}`)
        yield row
      }
    },
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

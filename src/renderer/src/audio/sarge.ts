// The sergeant's own voice — the 175 files under `Speech/Sku1/Sarge/`.
//
// Not the training instructor (audio/speech.ts), though it is the same actor:
// that one is `Speech/Sku1/Train1/tr1_en{NN}.wav`, 28 clips built by 0x43B530,
// and this is `SGEN{CC}{VV}.wav` built by 0x43B850 with no language in it at
// all. The two share the audio manager and nothing else — the exe keeps them
// apart with a tag byte, `[+0x14a]`, written 1 for the training set and 0 for
// this one, and its "is he still talking" test (0x43BB10) answers **3** for a
// Sarge line and 2 for a training one.
//
// Which line to play is the rules' business and it is pure
// (lib/game/sergeant.ts); this only fetches, decodes and speaks it.
//
// One at a time, cutting whatever was going — the exe stops the previous handle
// before it starts a new one (0x43BAAD).

import { context, speechOut } from './bank'
import { sargeFile } from '../../../lib/game/sergeant'

export interface Sarge {
  /** Say a line. Silent and harmless if the install has no Speech folder. */
  play(section: number, line: number): void
  /** Cut whatever he is saying. */
  stop(): void
  /**
   * Whether a line is in the air — what the END-OF-TURN beat holds on
   * (lib/game/battle.ts), the way the shot holds on a pig's own.
   *
   * Raised the moment a line is ASKED for rather than when its buffer is
   * ready: a file still loading is a sergeant about to speak, and letting the
   * turn hand over in that window is the race it would otherwise have.
   */
  saying(): boolean
  /** Every file played, in order: the only way a spec can hear this. */
  spoken(): string[]
  dispose(): void
}

/**
 * WHAT EACH CATEGORY IS — the file's number, not the section argument, because
 * the folder is what an ear browses.
 *
 * The MOMENT is read out of the exe (twenty-one call sites, all of them in
 * `docs/history/turns.md`); the WORDS were heard by play on 2026-08-20, since
 * no table in the game prints one of these lines. Where the two disagree the
 * ear wins and the entry says so.
 *
 * **What the listening turned up is a whole SYSTEM: a MEDAL economy**, five of
 * whose six categories talk about medals — awarded, refused, taken back — with
 * 12 saying what they are for: collect them or you are not promoted. The
 * counter is `[pig+0x1DE]` and category 08's own call site is the instruction
 * that subtracts from it.
 *
 * **What they hang off was got wrong here first.** They are NOT the weapon
 * crate: an ordinary crate never reaches that code. They are an OBJECT being
 * finished — a gun, a tent, a pillbox — through an action record built at load
 * out of the POG's fields 14..16. `docs/todo.md` carries the whole dispatch.
 * `pow.sarge.list()` prints this.
 */
export const SARGE_CATEGORIES: Readonly<Record<number, string>> = {
  1: 'end of turn, you LOST a pig and your side is behind — BUILT. A threat',
  2: "START of a turn that is not yours, THEY are behind — BUILT. Amateurs",
  3: 'end of turn, you KILLED and your side is ahead — BUILT. Praise',
  4: "START of a turn that is not yours, THEY are ahead — BUILT. A comeback",
  5: 'an OBJECT finished, action kind 13, value not 0xFF — a SUPPLY drop',
  6: 'the same, value 0xFF — MEDICAL supplies, and do not waste them',
  7: 'action kind 2 or 14 — a MEDAL dropped: "I am dropping you a medal"',
  8: 'action kind 4 or 16 — a MEDAL TAKEN BACK, `[pig+0x1DE] -= value`',
  9: 'an object finished and its LINK partner found — the DROP POINT',
  10: 'the same arm, the other branch — a MEDAL for doing it IN TIME',
  11: 'start of turn, ONCE a battle (latched): things lie about, medals included',
  12: 'start of turn, ONCE a battle (second latch): collect medals or no promotion',
  13: 'the clock running out, MULTIPLAYER only — one pool of SIXTEEN with 14',
  14: '…the other half of that pool. "Time is of the essence, be quick now"',
  15: 'multiplayer, by the pig NATION: 1..4 praise, 5..8 commiseration',
  16: 'multiplayer, nation 1 — heard: praise',
  17: 'multiplayer, nation 2',
  18: 'multiplayer, nation 3',
  19: 'multiplayer, nation 4',
  20: 'multiplayer, nation 5',
  21: 'multiplayer, nation 6',
  22: 'the MEDAL CEREMONY on the squad screen after a mission [play] — seven long lines'
}

/** The one sergeant, made on first use. A battle takes him and gives him back
 * (`stop`, never `dispose`), so the console keeps him between missions. */
let shared: Sarge | null = null
export function sarge(): Sarge {
  if (!shared) shared = createSarge()
  return shared
}

/**
 * `pow.sarge` — because WHICH of his 22 categories belongs to which moment is
 * an EAR's question and nobody else's, and the browser console is where this
 * project settles those (`pow.sfx` is the same arrangement for the bank).
 *
 * Installed from the app's own start rather than from a battle, so the lines
 * can be walked from the menu.
 */
export function installSargeConsole(): void {
  if (!window.pow) return
  window.pow.sarge = {
    play: (section, line) => (sarge().play(section, line), sargeFile(section, line)),
    // …and by the FILE's own number, which is what the folder shows and what an
    // ear is actually browsing. One higher than the section, always.
    file: (category, line) => {
      const path = sargeFile(category - 1, line)
      sarge().play(category - 1, line)
      return path
    },
    stop: () => sarge().stop(),
    spoken: () => sarge().spoken(),
    list: () => ({ ...SARGE_CATEGORIES })
  }
}

export function createSarge(): Sarge {
  const buffers = new Map<string, AudioBuffer | null>()
  const heard: string[] = []
  let source: AudioBufferSourceNode | null = null
  let saying = 0
  let disposed = false

  const stop = (): void => {
    const going = source
    source = null
    // Cleared first: `stop()` fires `onended`, which must not read its own cut
    // as a line finishing.
    if (going) going.stop()
  }

  const start = (path: string): void => {
    const ctx = context()
    const buffer = buffers.get(path)
    if (!ctx || !buffer || disposed) {
      saying = Math.max(0, saying - 1)
      return
    }
    // Chromium keeps the context suspended until the page has been clicked.
    if (ctx.state === 'suspended') void ctx.resume()
    stop()
    const going = ctx.createBufferSource()
    going.buffer = buffer
    going.connect(speechOut() ?? ctx.destination)
    going.onended = () => {
      if (source !== going) return
      source = null
      saying = Math.max(0, saying - 1)
    }
    going.start()
    source = going
  }

  const load = async (path: string): Promise<void> => {
    if (buffers.has(path)) return
    const file = await window.api.loadSound(path)
    if (!file.ok) {
      console.warn(`no sarge line ${path}: ${file.error}`)
      buffers.set(path, null)
      return
    }
    const ctx = context()
    if (!ctx || disposed) return
    try {
      // decodeAudioData detaches the buffer it is given, so it gets a copy.
      const bytes = new Uint8Array(file.data)
      buffers.set(path, await ctx.decodeAudioData(bytes.buffer as ArrayBuffer))
    } catch (error) {
      console.warn(`undecodable sarge line ${path}: ${String(error)}`)
      buffers.set(path, null)
    }
  }

  return {
    play(section, line) {
      if (disposed) return
      const path = sargeFile(section, line)
      heard.push(path)
      // A new line CUTS the old one, and the count goes with it: the exe stops
      // the previous handle rather than queueing.
      if (source) {
        stop()
        saying = Math.max(0, saying - 1)
      }
      saying++
      if (buffers.has(path)) start(path)
      else void load(path).then(() => start(path))
    },
    stop() {
      if (source) {
        stop()
        saying = Math.max(0, saying - 1)
      }
    },
    saying: () => saying > 0,
    spoken: () => [...heard],
    dispose() {
      disposed = true
      saying = 0
      stop()
      buffers.clear()
    }
  }
}

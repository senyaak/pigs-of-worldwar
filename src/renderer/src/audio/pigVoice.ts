// What a pig SAYS.
//
// Not the sergeant (audio/speech.ts) — the pigs' own barks, and like the
// sergeant's they are loose WAVs rather than a bank. `0x43af70` builds the
// path out of five pieces (0x4c2aac "speech", 0x4c2aa0 "\sku1\pig", a "0" pad
// below ten, the number, and a separator), and the install agrees exactly:
//
//     Speech/Sku1/Pig{NN}/{NN}{LANG}{CC}{VV}.wav
//
// with **NN the SQUAD's** voice, not the pig's — `[pig+0x1e8] = [squad+2]`
// and `[pig+0x1e9] = [squad+3]`, the language, set together at 0x466b1a. Nine
// voices ship, six languages apiece (the rows of 0x4c2988: EN AM FR GE RU JA
// TL), five categories of six lines.
//
// ## Which line, and the counter that picks it
//
// The caller passes a LINE NUMBER and the builder turns it into a category
// and a variant (0x43b215):
//
// ```
// if (line > 6) { category++; line -= 6 }
// category++
// if (category > 5) category = 1
// ```
//
// so with the firing call's `category = 1` a line of 1..12 lands on category
// **02** for the first six and **03** for the second. Twelve barks, and the
// caller walks them in strict rotation rather than at random: the squad
// record's own byte 5 counts 0..11 and wraps (0x4694a1), and the gun arm of
// `Pig::Fire` passes `counter + 1` (0x46946d).
//
// The remake keeps the rotation in the same place, per squad.

import { context } from './bank'

/** The languages, the rows of 0x4c2988. Only EN is used until something asks. */
const LANGUAGE = 'EN'
/** Six variants a category, five categories — the shipped layout. */
const VARIANTS = 6

/**
 * The line numbers `Pig::Fire` walks for a gun: twelve, one a shot, in order.
 * Its own arm passes `category = 1`, which is what puts them in files 02 and
 * 03 (0x46946d).
 */
export const FIRE_LINES = 12
const FIRE_CATEGORY = 1

/** How many voices ship: Speech/Sku1/Pig01..Pig09. */
const VOICES = 9

/**
 * Which of the nine a squad speaks with.
 *
 * The exe reads it out of the squad record (`[squad+2]`, copied into every
 * pig at 0x466b1a) and where THAT comes from is not decoded, so the remake
 * gives squad n voice n and wraps. Play will say if a nation sounds wrong.
 */
export const voiceFor = (squad: number): number => (Math.max(0, squad) % VOICES) + 1

export interface PigVoice {
  /** Say the next firing line for this squad, 0-based. */
  fire(squad: number): void
  /** Every file played, in order: the only way a spec can hear this. */
  spoken(): string[]
  dispose(): void
}

/**
 * A line number into a file name, the builder's own arithmetic (0x43b215).
 */
export function voiceFile(voice: number, line: number, category = FIRE_CATEGORY): string {
  let step = line
  let group = category
  if (step > VARIANTS) {
    group++
    step -= VARIANTS
  }
  group++
  if (group > 5) group = 1
  const nn = String(voice).padStart(2, '0')
  const cc = String(group).padStart(2, '0')
  const vv = String(step).padStart(2, '0')
  return `Speech/Sku1/Pig${nn}/${nn}${LANGUAGE}${cc}${vv}.wav`
}

export function createPigVoice(): PigVoice {
  const buffers = new Map<string, AudioBuffer | null>()
  const heard: string[] = []
  /** `[squad+5]`, one a squad: 0..11 and round again. */
  const counters = new Map<number, number>()
  let disposed = false

  const start = (path: string): void => {
    const ctx = context()
    const buffer = buffers.get(path)
    if (!ctx || !buffer || disposed) return
    if (ctx.state === 'suspended') void ctx.resume()
    const playing = ctx.createBufferSource()
    playing.buffer = buffer
    playing.connect(ctx.destination)
    playing.start()
  }

  const load = async (path: string): Promise<void> => {
    if (buffers.has(path)) return
    const file = await window.api.loadSound(path)
    if (!file.ok) {
      console.warn(`no pig voice ${path}: ${file.error}`)
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
      console.warn(`undecodable pig voice ${path}: ${String(error)}`)
      buffers.set(path, null)
    }
  }

  return {
    fire(squad) {
      if (disposed) return
      const at = counters.get(squad) ?? 0
      counters.set(squad, at + 1 > FIRE_LINES - 1 ? 0 : at + 1)
      const path = voiceFile(voiceFor(squad), at + 1)
      heard.push(path)
      if (buffers.has(path)) start(path)
      else void load(path).then(() => start(path))
    },
    spoken: () => [...heard],
    dispose() {
      disposed = true
      buffers.clear()
    }
  }
}

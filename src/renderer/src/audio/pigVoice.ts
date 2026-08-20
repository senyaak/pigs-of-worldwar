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

import { context, speechOut } from './bank'

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

/**
 * The line numbers `Pig::React(7)` walks at the TOP OF A TURN — and this arm
 * passes **category 0**, which is not a category at all but the builder's own
 * signal to pick the line off the pig's HEALTH (0x43b1e3):
 *
 * ```
 * health >  0xC80          -> line
 * health >  0x500          -> line + 2
 * otherwise                -> line + 4
 * ```
 *
 * and `category++` afterwards makes every one of them file **01** — the
 * category nothing had been placed in. The exe stores health in 128ths of a
 * point (lib/game/health.ts), so 0xC80 is **25** whole points and 0x500 is
 * **10**: an absolute pair of thresholds, not a fraction of the class's own
 * ceiling.
 *
 * The line inside a band is a rotation like the firing one, but over **two**
 * rather than twelve: the counter is the squad's byte 4 and it wraps above 1
 * (0x472589). So a healthy pig alternates 01 and 02, a hurt one 03 and 04, and
 * one nearly out of it 05 and 06.
 */
export const TURN_LINES = 2
const TURN_CATEGORY = 0
/** Whole points, the exe's 0xC80 and 0x500 out of 128ths (0x43b1e3). */
export const TURN_HEALTHY = 25
export const TURN_HURT = 10

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
  /**
   * …and the line at the TOP OF A TURN, which the pig's own health picks.
   *
   * **Only a pig NOBODY is driving says one.** The exe's own arm splits on the
   * controller before it gets here (`cmp eax,2` at 0x4724e5): the local human's
   * pig gets a plain grunt instead, which is the bank's business rather than
   * the voice's (audio/battleSound.ts).
   */
  turn(squad: number, health: number): void
  /** Every file played, in order: the only way a spec can hear this. */
  spoken(): string[]
  /** Whether a line is still going. The SHOT waits for it (lib/game/shot.ts). */
  saying(): boolean
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
  /** …and `[squad+4]`, the TURN line's own, over two. Separate because the exe
   * keeps them in separate bytes: a shot must not step a turn's line on. */
  const turnCounters = new Map<number, number>()
  let disposed = false

  /**
   * How many lines are in the air — what the SHOT waits for. Play: "надо ждать
   * пока свинья договорит фразу, только потом стрелять." Counted rather than
   * timed, because the file's own length is the answer and it is different for
   * every line (0.2 s to 5.7 s over the shipped set).
   *
   * It is raised the moment the line is ASKED for, not when the buffer is
   * ready: a file still loading is a pig about to speak, and letting the shot
   * through in that window is the very race this closes.
   */
  let saying = 0

  const start = (path: string): void => {
    const ctx = context()
    const buffer = buffers.get(path)
    if (!ctx || !buffer || disposed) {
      saying = Math.max(0, saying - 1)
      return
    }
    if (ctx.state === 'suspended') void ctx.resume()
    const playing = ctx.createBufferSource()
    playing.buffer = buffer
    playing.connect(speechOut() ?? ctx.destination)
    playing.onended = (): void => {
      saying = Math.max(0, saying - 1)
    }
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
      saying++
      if (buffers.has(path)) start(path)
      else void load(path).then(() => start(path))
    },
    turn(squad, health) {
      if (disposed) return
      const at = turnCounters.get(squad) ?? 0
      turnCounters.set(squad, at + 1 > TURN_LINES - 1 ? 0 : at + 1)
      const band = health > TURN_HEALTHY ? 0 : health > TURN_HURT ? 2 : 4
      const path = voiceFile(voiceFor(squad), at + 1 + band, TURN_CATEGORY)
      heard.push(path)
      saying++
      if (buffers.has(path)) start(path)
      else void load(path).then(() => start(path))
    },
    spoken: () => [...heard],
    saying: () => saying > 0,
    dispose() {
      disposed = true
      saying = 0
      buffers.clear()
    }
  }
}

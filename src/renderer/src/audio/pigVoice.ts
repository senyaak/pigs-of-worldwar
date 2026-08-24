// What a pig SAYS.
//
// Not the sergeant (audio/speech.ts) — the pigs' own barks, and like the
// sergeant's they are loose WAVs rather than a bank. `0x43af70` builds the
// path out of five pieces (0x4c2aac "speech", 0x4c2aa0 "\sku1\pig", a "0" pad
// below ten, the number, and a separator), and the install agrees exactly:
//
//     Speech/Sku1/Pig{NN}/{NN}{LANG}{CC}{VV}.wav
//
// with **NN the PIG's OWN** voice — read 2026-08-24 and corrected: the record
// `[pig+0x3CC]` points at is not a squad's but the pig's own 64-byte ROSTER
// SLOT (all four spawn sites hand the constructor `&team.slot[n]`), so
// `[pig+0x1e8] = [slot+2]` is the pig's IDENTITY and `[pig+0x1e9] =
// [slot+3]` its LANGUAGE. The one writer is the identity roller 0x482520:
// the voice is the NAME-TABLE ROW's own identity — name k always speaks
// Pig{k+1} — and the language is `Team::SkinOf(nation)`
// (lib/game/nations.ts, `SKIN_SPEECH`). The whole chain is `speech/pigs.md`.
//
// Nine voices ship, six languages apiece (the rows of 0x4c2988: EN AM FR GE
// RU JA TL, of which TL ships nothing), five categories of six lines.
//
// **And every rotation is PER PIG**, not per side — three counters in three
// bytes of that one slot — which is why two pigs of a side say consecutive
// lines rather than the same one. The exe even carries them between missions,
// the save being the team record dumped whole; ours start fresh each battle
// (`[gap]`, and nobody can hear it).
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

import { context, speechOut, wakeAudio } from './bank'
import { SKIN_SPEECH } from '../../../lib/game/nations'

/** What a pig speaks where nothing says otherwise — the British row. */
const DEFAULT_LANGUAGE = SKIN_SPEECH[0]
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

/**
 * The line numbers a pig DIES on — files **04** and **05**, the two
 * categories the notes had left unplaced. Read at the state 6 → 7 edge
 * (0x46f947, right after the dying clip is picked): `0x43AF70(pig, 3,
 * [squad+6]+1, …)` — category 3, twelve lines, walked in strict rotation on
 * the squad's OWN byte 6 (wraps past 11 at 0x46f95c), the third counter
 * beside the shot's and the turn's. A DROWNED pig plays `P_DROWN` instead
 * and a gassed one `P_SICK` — the phrase is the dry, unpoisoned death's.
 */
export const DEATH_LINES = 12
const DEATH_CATEGORY = 3

/** How many voices ship: Speech/Sku1/Pig01..Pig09. */
export const VOICES = 9

/**
 * A pig's IDENTITY into the folder number — the exe's own `Pig{k+1}` for
 * name row k (0x48263f writes `[row+8]` and the shipped rows are
 * `{k,k,k,nation}`). Wrapped, because a DRAFT pig has no name row and falls
 * back on its slot (lib/game/muster.ts).
 */
export const voiceFor = (identity: number): number => (Math.max(0, identity) % VOICES) + 1

export interface PigVoice {
  /** Say this pig's next firing line. `voice` is its own 1..9 (the battle
   * carries it, lib/game/game.ts) and `language` its side's row. */
  fire(voice: number, language?: string): void
  /**
   * …and the line at the TOP OF A TURN, which the pig's own health picks.
   *
   * **Only a pig NOBODY is driving says one.** The exe's own arm splits on the
   * controller before it gets here (`cmp eax,2` at 0x4724e5): the local human's
   * pig gets a plain grunt instead, which is the bank's business rather than
   * the voice's (audio/battleSound.ts).
   */
  turn(voice: number, health: number, language?: string): void
  /** …and the DEATH line, spoken as the dying clip starts (the `dying`
   * event, lib/game/corpses.ts) — never at the blow, and never for a
   * drowned pig, whose noise is the gurgle (audio/battleAudio.ts). */
  death(voice: number, language?: string): void
  /** Every file played, in order: the only way a spec can hear this. */
  spoken(): string[]
  /** Whether a line is still going. The SHOT waits for it (lib/game/shot.ts). */
  saying(): boolean
  dispose(): void
}

/**
 * A line number into a file name, the builder's own arithmetic (0x43b215).
 */
export function voiceFile(
  voice: number,
  line: number,
  category = FIRE_CATEGORY,
  language: string = DEFAULT_LANGUAGE
): string {
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
  return `Speech/Sku1/Pig${nn}/${nn}${language}${cc}${vv}.wav`
}

export function createPigVoice(): PigVoice {
  const buffers = new Map<string, AudioBuffer | null>()
  const heard: string[] = []
  /** `[slot+5]`, one a PIG: 0..11 and round again. Keyed by voice AND
   * language, which is one pig: a side's identities are unique (the roller
   * re-rolls a taken one, 0x4825bf) and two sides in the same tongue are two
   * nations of one skin, which cannot happen. */
  const counters = new Map<string, number>()
  /** …and `[slot+4]`, the TURN line's own, over two. Separate because the exe
   * keeps them in separate bytes: a shot must not step a turn's line on. */
  const turnCounters = new Map<string, number>()
  /** …and `[slot+6]`, the DEATH line's, over twelve — the third byte. */
  const deathCounters = new Map<string, number>()
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
    // Through the pause-aware wake (audio/bank.ts): a cue must not un-mute a pause.
    wakeAudio()
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

  /** Ask for one file: counted as speech from the ASK, loaded if new. */
  const speak = (path: string): void => {
    heard.push(path)
    saying++
    if (buffers.has(path)) start(path)
    else void load(path).then(() => start(path))
  }

  return {
    fire(voice, language = DEFAULT_LANGUAGE) {
      if (disposed) return
      const who = `${voice}${language}`
      const at = counters.get(who) ?? 0
      counters.set(who, at + 1 > FIRE_LINES - 1 ? 0 : at + 1)
      speak(voiceFile(voice, at + 1, FIRE_CATEGORY, language))
    },
    turn(voice, health, language = DEFAULT_LANGUAGE) {
      if (disposed) return
      const who = `${voice}${language}`
      const at = turnCounters.get(who) ?? 0
      turnCounters.set(who, at + 1 > TURN_LINES - 1 ? 0 : at + 1)
      const band = health > TURN_HEALTHY ? 0 : health > TURN_HURT ? 2 : 4
      speak(voiceFile(voice, at + 1 + band, TURN_CATEGORY, language))
    },
    death(voice, language = DEFAULT_LANGUAGE) {
      if (disposed) return
      const who = `${voice}${language}`
      const at = deathCounters.get(who) ?? 0
      deathCounters.set(who, at + 1 > DEATH_LINES - 1 ? 0 : at + 1)
      speak(voiceFile(voice, at + 1, DEATH_CATEGORY, language))
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

// Playing the game's own sounds.
//
// The install ships two banks of plain RIFF — `Audio/sfxday.srl` for the
// battle and `FESounds/Fesounds.srl` for the frontend — each a numbered
// list of files (lib/formats/srl.ts). Everything is 16-bit PCM mono at
// 22050, which Chromium decodes without help.
//
// A sound is asked for by NAME (`FT_GRASS`, `S_SELECT`) rather than by
// index, because a name survives a bank being reloaded and reads at the
// call site. The index is what the exe uses and the bank keeps it, for
// whenever a decoded call site names a number.
//
// Nothing here throws at the caller. A missing file, an install without an
// Audio folder, an AudioContext the browser will not start until the user
// clicks — all of it ends as silence, because a game that will not run
// without its sound effects is worse than a quiet one.

import type { SoundEntry } from '../api'

export interface Bank {
  /** Start a sound. Silent and harmless if it is not in the bank. */
  play(name: string, options?: { gain?: number; rate?: number }): void
  /** Whether a name is in this bank at all. */
  has(name: string): boolean
  /** Every name the bank carries, in index order. */
  names(): string[]
  /** What has been played, in order — the only way a spec can hear. */
  played(): string[]
  dispose(): void
}

/** A bank that has nothing in it: what a failed load leaves behind. */
export const SILENT: Bank = {
  play: () => {},
  has: () => false,
  names: () => [],
  played: () => [],
  dispose: () => {}
}

let shared: AudioContext | null = null

/** The one AudioContext, made on first use — the speech shares it. */
export function context(): AudioContext | null {
  if (shared) return shared
  try {
    shared = new AudioContext()
  } catch {
    return null
  }
  return shared
}

/**
 * THE MIXER — a master with three buses under it, and the knobs are the pause
 * menu's.
 *
 * SFX carries the bank, SPEECH carries the sergeant and the pig voices, MUSIC
 * carries the level's track (audio/music.ts). The exe keeps the same three on
 * its sound manager — master at `[+0x14]`, sfx at `[+0x1A]` and speech as a
 * flag at `[+0x18]` — and the in-mission menu writes them directly, which is
 * why a volume set there lasts as long as the process and no longer.
 *
 * **The music hangs under the MASTER on purpose**, which buys two things for
 * nothing: the pause's `suspendAudio` freezes the track mid-bar with
 * everything else, and the master knob reaches it — which is what the exe does
 * too, its master path being re-applied to the music (0x43C720). The exe has
 * no separate music slider, and neither does this.
 */
let masterGain: GainNode | null = null
let sfxGain: GainNode | null = null
let speechGain: GainNode | null = null
let musicGain: GainNode | null = null

function mixer(): { sfx: GainNode; speech: GainNode; music: GainNode } | null {
  const ctx = context()
  if (!ctx) return null
  if (!masterGain || !sfxGain || !speechGain || !musicGain) {
    masterGain = ctx.createGain()
    masterGain.connect(ctx.destination)
    sfxGain = ctx.createGain()
    sfxGain.connect(masterGain)
    speechGain = ctx.createGain()
    speechGain.connect(masterGain)
    musicGain = ctx.createGain()
    musicGain.connect(masterGain)
  }
  return { sfx: sfxGain, speech: speechGain, music: musicGain }
}

/** Where a sound EFFECT goes. Null only when there is no audio at all. */
export const sfxOut = (): AudioNode | null => mixer()?.sfx ?? null
/** Where a SPOKEN line goes — the sergeant, and a pig's own noises. */
export const speechOut = (): AudioNode | null => mixer()?.speech ?? null
/** Where the level's TRACK goes (audio/music.ts). */
export const musicOut = (): AudioNode | null => mixer()?.music ?? null

/** 0..100, the same range the menu's twenty-cell bar counts in fives. */
export function setMasterVolume(percent: number): void {
  const level = mixer()
  if (level && masterGain) masterGain.gain.value = Math.max(0, Math.min(100, percent)) / 100
}

export function setSfxVolume(percent: number): void {
  const level = mixer()
  if (level) level.sfx.gain.value = Math.max(0, Math.min(100, percent)) / 100
}

/**
 * …and the MUSIC's own trim, which no menu writes.
 *
 * The exe passes 70 of 128 as the volume at every in-battle music site
 * (`push 0x46` before 0x43b4c0), so the track sits well under the effects
 * rather than level with them. `audio/music.ts` sets it once and leaves it;
 * the console can move it.
 */
export function setMusicVolume(percent: number): void {
  const level = mixer()
  if (level) level.music.gain.value = Math.max(0, Math.min(100, percent)) / 100
}

/**
 * SPEECH is a switch and not a slider, which is what the exe makes it: one
 * byte, written rather than flipped. Turning it off also CUTS the line being
 * spoken (0x4923EB), and that half is the speech domain's — this only stops
 * the next one being heard.
 */
export function setSpeechOn(on: boolean): void {
  const level = mixer()
  if (level) level.speech.gain.value = on ? 1 : 0
}

/**
 * STOP EVERY SOUND IN THE GAME, and start them again.
 *
 * One context is shared by the bank, the pig voices and the speech
 * (`context()` above), so suspending it is the whole of a pause's silence —
 * and it is a suspend rather than a stop because a suspended context keeps
 * what is playing exactly where it was: the sergeant resumes mid-word instead
 * of losing his line.
 *
 * Play named the bug this answers: alt-tabbing froze the world and left the
 * instructor talking (`docs/todo.md` B4b).
 */
export function suspendAudio(): void {
  void shared?.suspend()
}

export function resumeAudio(): void {
  void shared?.resume()
}

/**
 * Load a bank and its files. The .srl is read up front — it is a few
 * hundred bytes — and each sound is fetched and decoded the first time it
 * is asked for, so a map that never lands in lava never loads FT_LAVA.
 */
/**
 * The battle bank, loaded ONCE for the whole app.
 *
 * A battle used to load its own every time it opened, which was fine while the
 * bank was only ever heard inside one — and it is not: `pow.sfx` is how a name
 * pick gets settled, and play asked to browse the sounds without starting a
 * mission ("может я сам послушаю?"), exactly as they did with the sergeant
 * (audio/sarge.ts). One promise, kept, and a battle borrows it.
 */
let theBank: Promise<Bank> | null = null
export function sharedBank(srlPath: string): Promise<Bank> {
  if (!theBank) theBank = loadBank(srlPath)
  return theBank
}

export async function loadBank(srlPath: string): Promise<Bank> {
  const result = await window.api.loadSoundBank(srlPath)
  if (!result.ok) {
    console.warn(`no sound: ${result.error}`)
    return SILENT
  }

  const entries = new Map<string, SoundEntry>()
  for (const entry of result.bank.entries) entries.set(entry.name, entry)
  const buffers = new Map<string, AudioBuffer | null>()
  const loading = new Set<string>()
  const heard: string[] = []
  let disposed = false

  const fetch = async (name: string): Promise<void> => {
    if (loading.has(name) || buffers.has(name)) return
    loading.add(name)
    const entry = entries.get(name)!
    const file = await window.api.loadSound(entry.path.replace(/\\/g, '/'))
    if (!file.ok) {
      console.warn(`no sound ${name}: ${file.error}`)
      buffers.set(name, null)
      return
    }
    const ctx = context()
    if (!ctx || disposed) return
    try {
      // decodeAudioData detaches the buffer it is given, so it gets a copy.
      const bytes = new Uint8Array(file.data)
      buffers.set(name, await ctx.decodeAudioData(bytes.buffer as ArrayBuffer))
    } catch (error) {
      console.warn(`undecodable sound ${name}: ${String(error)}`)
      buffers.set(name, null)
    }
  }

  const start = (name: string, gain: number, rate: number): void => {
    const ctx = context()
    const buffer = buffers.get(name)
    if (!ctx || !buffer || disposed) return
    // Chromium keeps the context suspended until the page has been clicked;
    // the game's first sound often comes before that, and resuming here is
    // what makes it audible from the next one on.
    if (ctx.state === 'suspended') void ctx.resume()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    const volume = ctx.createGain()
    volume.gain.value = gain
    source.connect(volume).connect(sfxOut() ?? ctx.destination)
    source.start()
  }

  return {
    has: (name) => entries.has(name),
    names: () => [...entries.keys()],
    played: () => [...heard],
    play(name, options) {
      if (!entries.has(name) || disposed) return
      heard.push(name)
      const gain = options?.gain ?? 1
      const rate = options?.rate ?? 1
      // First time round the sound has to be fetched, so it lands a beat
      // late; every time after it is immediate.
      if (buffers.has(name)) start(name, gain, rate)
      else void fetch(name).then(() => start(name, gain, rate))
    },
    dispose() {
      disposed = true
      buffers.clear()
    }
  }
}

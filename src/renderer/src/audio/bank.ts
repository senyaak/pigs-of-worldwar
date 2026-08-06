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

/** The one AudioContext, made on first use. */
function context(): AudioContext | null {
  if (shared) return shared
  try {
    shared = new AudioContext()
  } catch {
    return null
  }
  return shared
}

/**
 * Load a bank and its files. The .srl is read up front — it is a few
 * hundred bytes — and each sound is fetched and decoded the first time it
 * is asked for, so a map that never lands in lava never loads FT_LAVA.
 */
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
    source.connect(volume).connect(ctx.destination)
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

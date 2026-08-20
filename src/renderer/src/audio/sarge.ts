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

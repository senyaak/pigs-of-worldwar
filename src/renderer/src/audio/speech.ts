// The instructor's voice.
//
// Speech is not in a bank: it is loose WAVs under `Speech/`, and the exe
// builds each path rather than storing it (0x43B530) —
//
//     speech\sku1\train{set+1}\tr{set+1}_{LANG}{NN}.wav
//
// — with the language a row of the table at 0x4C2988 (`EN AM FR GE RU JA
// TL`) and a leading zero below ten. Every training call passes set 0 and
// language 0, and English speech is all that ships, so the training set is
// `Speech/Sku1/Train1/tr1_en01..28.wav`.
//
// One voice at a time: a new line cuts the one before it, because the
// sergeant does not talk over himself.

import { context, speechOut, wakeAudio } from './bank'

/** The only speech set the game ships, and the language it ships in. */
const SET = 1
const LANGUAGE = 'en'
const FOLDER = `Speech/Sku1/Train${SET}`

export interface Speech {
  /** Say clip 1..28. Silent and harmless if the install has no Speech. */
  play(clip: number): void
  /** Cut whatever is being said. */
  stop(): void
  /** Which clip is being spoken, or 0 — the tutorial script's cue to wait. */
  saying(): number
  /** Every clip played, in order: the only way a spec can hear this. */
  spoken(): number[]
  dispose(): void
}

const pathFor = (clip: number): string =>
  `${FOLDER}/tr${SET}_${LANGUAGE}${String(clip).padStart(2, '0')}.wav`

export function createSpeech(): Speech {
  const buffers = new Map<number, AudioBuffer | null>()
  const heard: number[] = []
  let source: AudioBufferSourceNode | null = null
  let saying = 0
  let disposed = false

  const stop = (): void => {
    if (source) source.stop()
    source = null
    saying = 0
  }

  const start = (clip: number): void => {
    const ctx = context()
    const buffer = buffers.get(clip)
    if (!ctx || !buffer || disposed) return
    // Chromium keeps the context suspended until the page has been clicked.
    // Through the pause-aware wake (audio/bank.ts): a cue must not un-mute a pause.
    wakeAudio()
    stop()
    const playing = ctx.createBufferSource()
    playing.buffer = buffer
    playing.connect(speechOut() ?? ctx.destination)
    playing.onended = () => {
      if (source === playing) {
        source = null
        saying = 0
      }
    }
    playing.start()
    source = playing
    saying = clip
  }

  const fetch = async (clip: number): Promise<void> => {
    if (buffers.has(clip)) return
    const file = await window.api.loadSound(pathFor(clip))
    if (!file.ok) {
      console.warn(`no speech ${clip}: ${file.error}`)
      buffers.set(clip, null)
      return
    }
    const ctx = context()
    if (!ctx || disposed) return
    try {
      // decodeAudioData detaches the buffer it is given, so it gets a copy.
      const bytes = new Uint8Array(file.data)
      buffers.set(clip, await ctx.decodeAudioData(bytes.buffer as ArrayBuffer))
    } catch (error) {
      console.warn(`undecodable speech ${clip}: ${String(error)}`)
      buffers.set(clip, null)
    }
  }

  return {
    play(clip) {
      if (disposed || clip <= 0) return
      heard.push(clip)
      // The clips are seconds long apiece, so they are fetched on demand and
      // kept: the first line of a level lands a beat late, the rest do not.
      if (buffers.has(clip)) start(clip)
      else void fetch(clip).then(() => start(clip))
    },
    stop,
    saying: () => saying,
    spoken: () => [...heard],
    dispose() {
      stop()
      disposed = true
      buffers.clear()
    }
  }
}

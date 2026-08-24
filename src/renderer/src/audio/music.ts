// The level's music.
//
// The install ships `MUSIC/Track02.ogg`..`Track32.ogg` — 31 Ogg Vorbis files,
// stereo 44100, which Chromium decodes without help — and the game reaches
// them through a CD: `warhogs_.exe` sends MCI `cdaudio` commands, and the
// install's own `winmm.dll` (a MinGW shim, not Microsoft's) turns a track
// number into `MUSIC\Track%02d.ogg`. So the disc the manual tells you to leave
// in the drive is a folder, and nothing here needs a decoder of our own.
//
// **What the exe asks for is a CLIP, 0..29.** `Sound::PlayMusicClip`
// (0x43b4c0) clamps anything from 30 up to 29 — with a complaint of its own,
// "ERROR:Music clip requested is out of range" at 0x4c2ab4, which is what
// names the function — and turns the clip into the MCI pair `(clip + 3,
// clip + 4)`, a play-from/play-to over ONE track. So clip N is `Track{N+3}`,
// which lands the thirty clips exactly on Track03..Track32 and leaves Track02,
// the only long piece in the folder at 171 seconds, to the front end.
//
// ## A SET of four, and the turn is what steps it
//
// The three level sites (0x48fc43, 0x490dd5, 0x491240) all build the clip the
// same way, and 0x491240 is the one that says WHEN — it sits in mode 4, the
// "START OF TURN" card, and only on the arm the local human's controller
// takes (`call [vtbl+0x18]; cmp eax,2; jne`). Disassembled:
//
//     00491222  mov   ecx, [eax + 0x10]        ; the acting pig
//     00491227  movsx eax, byte [eax + 0x106]  ; the counter, 0..3
//     0049122e  mov   dl,  byte [ecx + 0x1e9]  ; the SET
//     00491234  push  0x46                     ; volume
//     00491236  lea   ecx, [eax + edx*4]       ; clip = counter + 4·set
//     00491240  call  0x43b4c0
//     0049124b  inc; cmp 3; jle; else 0        ; and the counter steps
//
// So a side owns FOUR clips and walks them in order, **one a turn**, and only
// on the turns the player is given. It does not loop and it is not re-triggered
// when a track runs out: a thirteen-second sting at the top of the turn, then
// quiet. That is why the folder's short pieces are short.
//
// `[pig+0x1e9]` is `[squad+3]`, written at 0x466b42 beside `[pig+0x1e8]` =
// `[squad+2]` — the very pair the pig-voice path reads as its VOICE and its
// LANGUAGE (`speech/pigs.md`, audio/pigVoice.ts). What fills the squad record
// has never been read, so which set a side owns is `[CHECK — remake]` the same
// way its voice is, and for the same reason.
//
// Nothing here throws. An install with no MUSIC folder is a quiet one, which
// is the same rule the sample bank keeps.

import { context, musicOut, setMusicVolume, wakeAudio } from './bank'

/** Clips 0..29 — the exe's own clamp (0x43b4c0). */
export const MUSIC_CLIPS = 30
/** How many clips a side's set holds, and how far its counter counts. */
export const SET_SIZE = 4
/**
 * The volume the exe pushes at every level music site (`push 0x46`), on the
 * same 0..100 scale its speech calls use — so the track sits well under the
 * effects rather than level with them.
 */
export const MUSIC_VOLUME = 0x46

/** Which file a clip is. Pure, and the exe's own arithmetic. */
export const trackFor = (clip: number): string =>
  `MUSIC/Track${String(Math.max(0, Math.min(MUSIC_CLIPS - 1, clip)) + 3).padStart(2, '0')}.ogg`

/**
 * Which SET this SKIN plays — READ 2026-08-24, and the `[CHECK — remake]`
 * closes: the byte the exe multiplies by four is the pig's LANGUAGE, written
 * at the roster roll as `Team::SkinOf(nation)` (0x482520 tail, 0x48264c;
 * `speech/pigs.md`). So the sets run in SKIN order — British Track03-06,
 * American 07-10, French 11-14, German 15-18, Russian 19-22, Japanese
 * 23-26 — and set 6 (Track27-30) is never a side's: it is the EVENT sting
 * (`rand&3 + 24` on a supply drop and on reinforcements, 0x496c25/0x49742f).
 * A remake LARD side lands on it through the wrap because our roster gives
 * Lard pigs no origin nation, where the exe's do carry one — `[deliberate]`
 * until origins exist. Wrapped so no ask reaches past the thirty clips.
 */
export const setFor = (skin: number): number =>
  Math.max(0, Math.trunc(skin)) % Math.floor(MUSIC_CLIPS / SET_SIZE)

/**
 * The EVENT set — clips 24..27, i.e. Track27..Track30, the seventh set that
 * no side owns. The exe rolls one with `rand()&3 + 24` at exactly two sites:
 * a SUPPLY CRATE coming down (0x496c25) and hidden REINFORCEMENTS falling
 * due (0x49742f). `speech/pigs.md`, 2026-08-24.
 */
export const EVENT_SET = 6
export const eventClip = (roll: number): number =>
  EVENT_SET * SET_SIZE + Math.min(SET_SIZE - 1, Math.max(0, Math.floor(roll * SET_SIZE)))

/**
 * The END OF MISSION clip — 28, i.e. **Track31**, played at 0x48fb08 where
 * the training ground plays the sergeant instead. Clip 29 (Track32) has no
 * caller anywhere in the image.
 */
export const END_CLIP = 28

export interface Music {
  /**
   * A turn has begun for this side: play the next of its four. `skin` picks
   * the SET (`setFor`); absent, the side's own index stands in — the old
   * stand-in, kept so the console's bare `pow.music.turn(n)` still sounds.
   *
   * The exe plays the counter's clip and THEN steps it, so a side's first turn
   * opens on the first of its set.
   */
  turn(side: number, skin?: number): void
  /** Play one clip and stop at its end — the console's door. */
  play(clip: number): void
  /** Cut the track. */
  stop(): void
  /** Which clip is sounding, or null. */
  playing(): number | null
  /** Every clip started, in order: the only way a spec can hear this. */
  played(): number[]
  dispose(): void
}

export function createMusic(): Music {
  const buffers = new Map<number, AudioBuffer | null>()
  const heard: number[] = []
  let source: AudioBufferSourceNode | null = null
  let sounding: number | null = null
  /** `[game+0x106]`, one a side: which of the four is up next. */
  const counters = new Map<number, number>()
  let disposed = false
  let trimmed = false

  const stop = (): void => {
    const going = source
    source = null
    sounding = null
    // Cleared FIRST: `stop()` fires `onended`, and the handler must not take
    // its own cut for a track running out.
    if (going) going.stop()
  }

  const fetch = async (clip: number): Promise<void> => {
    if (buffers.has(clip)) return
    const file = await window.api.loadSound(trackFor(clip))
    if (!file.ok) {
      console.warn(`no music ${clip}: ${file.error}`)
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
      console.warn(`undecodable music ${clip}: ${String(error)}`)
      buffers.set(clip, null)
    }
  }

  const start = (clip: number): void => {
    const ctx = context()
    const buffer = buffers.get(clip)
    // A track that will not load is simply a quiet turn: the next one steps
    // the counter on regardless, exactly as a played one would.
    if (!ctx || !buffer || disposed) return
    // Chromium keeps the context suspended until the page has been clicked.
    // Through the pause-aware wake (audio/bank.ts): a cue must not un-mute a pause.
    wakeAudio()
    if (!trimmed) {
      setMusicVolume(MUSIC_VOLUME)
      trimmed = true
    }
    stop()
    const going = ctx.createBufferSource()
    going.buffer = buffer
    going.connect(musicOut() ?? ctx.destination)
    going.onended = () => {
      if (source !== going) return
      source = null
      sounding = null
      // …and NOTHING follows it. The exe does not chase a finished track with
      // the next one: the turn is what asks for music, and the rest of a turn
      // is quiet.
    }
    going.start()
    source = going
    sounding = clip
  }

  const play = (clip: number): void => {
    if (disposed) return
    const wanted = Math.max(0, Math.min(MUSIC_CLIPS - 1, Math.trunc(clip)))
    heard.push(wanted)
    if (buffers.has(wanted)) start(wanted)
    else void fetch(wanted).then(() => start(wanted))
  }

  return {
    turn(side, skin) {
      const at = counters.get(side) ?? 0
      counters.set(side, (at + 1) % SET_SIZE)
      play(setFor(skin ?? side) * SET_SIZE + at)
    },
    play,
    stop,
    playing: () => sounding,
    played: () => [...heard],
    dispose() {
      disposed = true
      stop()
      buffers.clear()
    }
  }
}

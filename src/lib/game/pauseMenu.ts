// THE PAUSE MENU's rules — five rows, two of them sliders, one of them armed.
//
// It is NOT the frontend's machine. The menu screens are torn down when a
// mission loads; this is the mission object's own, drawn with the battle's
// small letters over the live frame (`ui/pauseMenu.ts` draws it). The exe
// toggles it at **0x491E60** and draws it at **0x45A9B0**, and the lit row
// dispatches through a five-entry jump table at **0x45B560** — five, so
// anything else somebody remembers being here (RESTART, INSTRUCTIONS) is not.
//
// The strings are `gtext`, and three of the ids near them are PSX leftovers
// with no reader in `.text` at all: 174 VOLUME, 178 INSTRUCTIONS and 240 PIG
// VOICES. Row three is 175 SPEECH. A note in this repo used to say PIG VOICES
// and it was wrong.
//
// Pure: state in, state out. No canvas, no audio, no Electron.

/** `-GAME PAUSED-`, drawn green above the rows (0x45ACD8). */
export const PAUSE_TITLE = 173

/** What a row IS, which is what a key press means on it. */
export type PauseRowKind = 'continue' | 'master' | 'sfx' | 'speech' | 'abort'

/** The five rows, top to bottom — the jump table's own order (0x45B560). */
export const PAUSE_ROWS: readonly { kind: PauseRowKind; label: number }[] = [
  { kind: 'continue', label: 181 },
  { kind: 'master', label: 238 },
  { kind: 'sfx', label: 239 },
  { kind: 'speech', label: 175 },
  { kind: 'abort', label: 179 }
]

/**
 * The last row is `ABORT MISSION` in a campaign and `ABORT SKIRMISH` outside
 * one — the exe switches on `[0x5206F0] == 1` (0x45B061). The remake has no
 * skirmish yet, so nothing asks for 180; the id is here because the row is
 * one row with two names, not two rows.
 */
export const ABORT_SKIRMISH = 180

/** `ON` and `OFF`, drawn after the SPEECH row's own label. */
export const SPEECH_ON = 176
export const SPEECH_OFF = 177

/** The confirm: `ARE YOU SURE?`, `YES`, `NO` (0x45AA5C). */
export const ARE_YOU_SURE = 182
export const CONFIRM_YES = 183
export const CONFIRM_NO = 184

/** A volume moves five at a time and stops at a hundred (0x492581). */
export const VOLUME_STEP = 5
export const VOLUME_MAX = 100
/** The track is twenty cells and the fill is `value / 5` of them (0x45ADC0). */
export const BAR_CELLS = 20
export const barCells = (value: number): number =>
  Math.max(0, Math.min(BAR_CELLS, Math.floor(value / VOLUME_STEP)))

/**
 * How the menu SOUNDS. Every noise it makes is one sample — id 0x61 in
 * `Audio/sfxday.srl`, which is `S_SELECT` — played at one of three pitches
 * against its own 0x64: plain for the cursor and for opening and closing,
 * 0x96 for a volume step, 0x82 for a toggle (0x492586, 0x4923D2).
 */
export const PAUSE_SOUND = 'S_SELECT'
export type PauseSound = 'plain' | 'volume' | 'toggle'
export const PAUSE_PITCH: Record<PauseSound, number> = {
  plain: 1,
  volume: 150 / 100,
  toggle: 130 / 100
}

export interface PauseState {
  /** Which row is lit, 0..4. It does NOT wrap (0x4922FE, 0x49232D). */
  row: number
  /** Whether ABORT has armed its ARE YOU SURE?. */
  confirming: boolean
  /** Which way the confirm is pointing. NO is where it starts (0x492221). */
  yes: boolean
  master: number
  sfx: number
  speech: boolean
}

/**
 * A pause as it OPENS.
 *
 * The row and the confirm start where the exe puts them; the three settings
 * do not, because the exe's are the engine's own and live between missions
 * while these are handed in by whoever owns the sound.
 */
export const newPause = (
  settings: { master: number; sfx: number; speech: boolean } = {
    master: VOLUME_MAX,
    sfx: VOLUME_MAX,
    speech: true
  }
): PauseState => ({ row: 0, confirming: false, yes: false, ...settings })

/** What a player can do to the menu. */
export type PauseVerb = 'up' | 'down' | 'left' | 'right' | 'select' | 'back'

export interface PauseOutcome {
  /** The noise to make, or null where the exe makes none. */
  sound: PauseSound | null
  /** Let the game go again. */
  resume: boolean
  /** End the mission — the exe's mode 17, which skips the debrief. */
  abort: boolean
  /** Cut the line being spoken: turning SPEECH off stops it mid-word
   * (0x4923AA, which calls the "is anything playing" test and then the
   * stopper). */
  cutSpeech: boolean
}

const NOTHING: PauseOutcome = { sound: null, resume: false, abort: false, cutSpeech: false }

const stepVolume = (value: number, by: number): number =>
  Math.max(0, Math.min(VOLUME_MAX, value + by))

/**
 * One key press against the menu, in place.
 *
 * `back` is ESCAPE, which is the same key that opened the pause. On the menu
 * proper it closes the pause; over an armed confirm it takes the confirm
 * down instead of the whole menu. **That second half is the remake's**
 * (`[CHECK — remake]`): the exe's toggle was read and the confirm flag's
 * behaviour across it was not, and stepping back one level is what a player
 * expects of the key that got them here.
 *
 * The floor on a volume is the remake's too. The exe clamps only the top
 * (0x492581); the bottom is a word going through zero, which is an overflow
 * rather than a behaviour.
 */
export function pausePress(state: PauseState, verb: PauseVerb): PauseOutcome {
  if (state.confirming) {
    switch (verb) {
      // LEFT arms YES and RIGHT arms NO — the confirm reads the way it is
      // drawn, YES on the left (0x4924A3, 0x4925E1).
      case 'left':
        if (state.yes) return NOTHING
        state.yes = true
        return { ...NOTHING, sound: 'toggle' }
      case 'right':
        if (!state.yes) return NOTHING
        state.yes = false
        return { ...NOTHING, sound: 'toggle' }
      case 'select':
        if (state.yes) return { ...NOTHING, sound: 'plain', abort: true }
        state.confirming = false
        return { ...NOTHING, sound: 'plain' }
      case 'back':
        state.confirming = false
        return { ...NOTHING, sound: 'plain' }
      default:
        return NOTHING
    }
  }

  const row = PAUSE_ROWS[state.row]?.kind ?? 'continue'
  switch (verb) {
    case 'up':
      if (state.row === 0) return NOTHING
      state.row--
      return { ...NOTHING, sound: 'plain' }
    case 'down':
      if (state.row === PAUSE_ROWS.length - 1) return NOTHING
      state.row++
      return { ...NOTHING, sound: 'plain' }
    case 'left':
    case 'right': {
      const by = verb === 'left' ? -VOLUME_STEP : VOLUME_STEP
      if (row === 'master') {
        state.master = stepVolume(state.master, by)
        return { ...NOTHING, sound: 'volume' }
      }
      if (row === 'sfx') {
        state.sfx = stepVolume(state.sfx, by)
        return { ...NOTHING, sound: 'volume' }
      }
      if (row === 'speech') {
        // LEFT is OFF and RIGHT is ON, and neither is a toggle: the exe writes
        // the value rather than flipping it (0x4923AA, 0x4924F1).
        const wanted = verb === 'right'
        const cutSpeech = state.speech && !wanted
        state.speech = wanted
        return { ...NOTHING, sound: 'toggle', cutSpeech }
      }
      return NOTHING
    }
    case 'select':
      // Only two rows answer SELECT at all. The sliders and the switch are
      // worked sideways and do nothing when it is pressed.
      if (row === 'continue') return { ...NOTHING, sound: 'plain', resume: true }
      if (row === 'abort') {
        state.confirming = true
        state.yes = false
        return { ...NOTHING, sound: 'plain' }
      }
      return NOTHING
    case 'back':
      return { ...NOTHING, sound: 'plain', resume: true }
    default:
      return NOTHING
  }
}

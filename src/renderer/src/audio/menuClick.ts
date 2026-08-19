// The PAUSE MENU's own noise — and it has a context of its own, on purpose.
//
// Every sound the pause menu makes is ONE sample at three pitches: index 0x61
// of `Audio/sfxday.srl`, which is `S_SELECT`, played at 0x64 for the cursor
// and for opening and closing, 0x96 for a volume step so the player hears the
// new level, and 0x82 for a toggle (exe 0x43A780 with those three; the rules
// carry the numbers, `lib/game/pauseMenu.ts`).
//
// **Why it does not share the game's `AudioContext`.** A pause SUSPENDS that
// one, which is what holds a half-spoken line exactly where it was instead of
// losing it — and a suspended context renders nothing at all, menu clicks
// included. The exe has no such trouble: it pauses twelve channel slots by
// hand (0x43A5F0) and then plays the click on the same engine. One extra
// context is the cheapest thing that gives both halves.
//
// It plays nothing else, ever. If a second in-battle menu wants a noise, it
// wants this file's shape, not this file's buffer.

let ctx: AudioContext | null = null
let click: AudioBuffer | null = null
let loading: Promise<void> | null = null

/**
 * Fetch and decode the one sample, once. A miss is a warning and silence —
 * a stripped install still pauses.
 */
export function loadMenuClick(srlPath: string, name: string): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    const result = await window.api.loadSoundBank(srlPath)
    if (!result.ok) {
      console.warn(`no menu click: ${result.error}`)
      return
    }
    const entry = result.bank.entries.find((one) => one.name === name)
    if (!entry) {
      console.warn(`no menu click: ${name} is not in ${srlPath}`)
      return
    }
    const file = await window.api.loadSound(entry.path.replace(/\\/g, '/'))
    if (!file.ok) {
      console.warn(`no menu click: ${file.error}`)
      return
    }
    try {
      ctx = new AudioContext()
      // decodeAudioData detaches what it is given, so it gets a copy.
      const bytes = new Uint8Array(file.data)
      click = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer)
    } catch (error) {
      console.warn(`undecodable menu click: ${String(error)}`)
      click = null
    }
  })()
  return loading
}

/** Play it, `rate` being the exe's pitch over its own 0x64. */
export function playMenuClick(rate: number): void {
  if (!ctx || !click) return
  // Chromium holds a fresh context suspended until the page has been clicked,
  // and a pause is a keypress rather than a click.
  if (ctx.state === 'suspended') void ctx.resume()
  const source = ctx.createBufferSource()
  source.buffer = click
  source.playbackRate.value = rate
  source.connect(ctx.destination)
  source.start()
}

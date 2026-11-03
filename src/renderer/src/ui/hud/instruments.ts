// THE BRASS: the clock, the power gauge with its lens, and the dial with the
// weapon slot beside it.

import { aimRadians } from '../../../../lib/game/aim'
import type { DashFrame, HudCore } from './frame'
import { AUTHORED_HEIGHT, LAYOUT } from './layout'

// The clock, bottom right, and the seconds in its two windows. Over 99
// it pins at 99: the gauge has room for two digits and no more.
export const drawClock = (core: HudCore, frame: DashFrame): void => {
  const { dash } = core
  const { viewWidth, state, art, blit } = frame
  const { clock: CLOCK } = LAYOUT
  const clockX = viewWidth - CLOCK.width - CLOCK.margin.right
  const clockY = AUTHORED_HEIGHT - CLOCK.height - CLOCK.margin.bottom
  blit(art.get('clock01'), clockX, clockY)
  blit(art.get('clock02'), clockX + 64, clockY)
  blit(art.get('clock03'), clockX, clockY + 28)
  blit(art.get('clock04'), clockX + 64, clockY + 28)
  const shown = Math.min(99, Math.max(0, Math.ceil(state.seconds)))
  blit(dash.digits[Math.floor(shown / 10)], clockX + CLOCK.digits.x, clockY + CLOCK.digits.y)
  blit(dash.digits[shown % 10], clockX + CLOCK.digits.x + CLOCK.digits.step, clockY + CLOCK.digits.y)
}

// The POWER GAUGE, centred along the bottom, and up for as long as
// something in hand has one. Five tiles WHOLE — index 0 is the TIM's
// transparent colour, so their black is a hole — and then the SLIDER
// running along them, which is what the gauge actually is: `powg1` moves,
// nothing fills.
export const drawGauge = (core: HudCore, frame: DashFrame): void => {
  const { context, scale, viewWidth, state, art, blit } = frame
  const { gauge: GAUGE } = LAYOUT
  if (state.charge !== null) {
    const gaugeX = Math.round((viewWidth - GAUGE.width) / 2)
    const gaugeY = AUTHORED_HEIGHT - GAUGE.height - GAUGE.margin.bottom
    for (let tile = 0; tile < 5; tile++) blit(art.get(`newpow${tile + 3}`), gaugeX + tile * 64, gaugeY)
    // …and the pair that sits above its left end.
    blit(art.get('newpow1'), gaugeX + GAUGE.cap.x, gaugeY + GAUGE.cap.y)
    blit(art.get('newpow2'), gaugeX + GAUGE.cap.x + 64, gaugeY + GAUGE.cap.y)
    const along = Math.min(1, Math.max(0, state.charge))
    const track = GAUGE.track
    const marker = GAUGE.slider.art
    const travel = track.to - track.from - marker.width + 1
    blit(
      art.get('powg1'),
      gaugeX + track.from - marker.x + travel * along,
      gaugeY + track.y
    )
    // …and the LENS at its left end, before the scale's own zero. Play
    // pointed at it twice: "надо внизу, левее нуля шкалы — там есть
    // полузалитый круг." How full it is is the weapon's CLASS and not its
    // charge (`GAUGE.lens`, and lib/game/grenade.ts for the class).
    if (state.lens !== null) {
      const lens = art.get('pcpie4')
      const box = GAUGE.lens
      const shows = Math.min(1, Math.max(0, state.lens * box.fill))
      // Against the DISC's own rows, not the tile's: the red runs 2..29 of
      // the 32 (measured off `pcpie4` itself), so a half taken over the tile
      // is not a half of the thing anybody is looking at.
      const disc = box.disc.bottom - box.disc.top + 1
      const rows = Math.max(0, Math.round(disc * shows))
      // …and the fill is measured up from the disc's own bottom edge.
      const from = box.disc.bottom + 1 - rows
      if (rows > 0) {
        context.drawImage(
          lens.image,
          0,
          from,
          lens.width,
          rows,
          Math.round((gaugeX + box.x) * scale),
          Math.round((gaugeY + box.y + from) * scale),
          Math.round(box.width * scale),
          Math.round(rows * scale)
        )
      }
    }
  }
}

// The dial and the weapon slot, top right. The slot stays empty until
// there is a weapon to put in it.
export const drawDial = (core: HudCore, frame: DashFrame): void => {
  const { skills, dash } = core
  const { context, scale, viewWidth, state, art, blit } = frame
  const { dial: DIAL } = LAYOUT
  const dialX = viewWidth - DIAL.width - DIAL.margin.right
  const dialY = DIAL.margin.top

  // The face first, under the rim: each fan has its point at the hub and
  // opens left, and the pair is mirrored to fill the lower half too.
  context.save()
  context.scale(scale, scale)
  context.translate(dialX + DIAL.hub.x, dialY + DIAL.hub.y)
  context.globalAlpha = DIAL.alpha
  for (const half of [1, -1]) {
    context.save()
    context.scale(1, half)
    for (const wedge of dash.fans) context.drawImage(wedge.image, -wedge.width, -wedge.height)
    context.restore()
  }
  context.restore()

  blit(art.get('ang1'), dialX, dialY + DIAL.arc.top)
  blit(art.get('ang3'), dialX, dialY + DIAL.arc.bottom)
  blit(art.get('ang2'), dialX + DIAL.slot.x, dialY + DIAL.slot.top)
  blit(art.get('ang4'), dialX + DIAL.slot.x, dialY + DIAL.slot.bottom)
  blit(art.get('ang5'), dialX + DIAL.slot.cap.x, dialY + DIAL.slot.cap.y)

  // What is in hand, in the ring beside the needle — the same icon the
  // skill menu shows, out of the same archive (ui/skillMenu.ts).
  const carried = skills.icon(state.holding)
  if (carried) {
    const box = DIAL.slot.icon
    blit(
      carried,
      dialX + box.x + (box.width - carried.width) / 2,
      dialY + box.y + (box.height - carried.height) / 2
    )
  }
  // The needle turns on the hub, and it is the aim angle it shows: the
  // arc is a half-disc and the angle's own limit is ±1023 of 4096, which
  // is the same ±90° (lib/game/aim.ts).
  const needle = art.get('angpoint')
  context.save()
  context.scale(scale, scale)
  context.translate(dialX + DIAL.hub.x, dialY + DIAL.hub.y)
  context.rotate(aimRadians(state.aim ?? 0))
  context.drawImage(needle.image, -needle.width, -needle.height / 2)
  context.restore()
}

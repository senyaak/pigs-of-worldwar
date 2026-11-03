// THE DAMAGE floating off whatever was just hit (three/damageNumbers.ts).

import type { DashFrame, HudCore } from './frame'
import { LAYOUT } from './layout'

// The damage floating off whatever was just hit, in the same letters
// and the same widget units. It is the original's own effect (0x487b90)
// and it shows POINTS; how it MOVES is the remake's own, so it rises
// and thins out (three/damageNumbers.ts). Drawn before the plates and
// outside their delay: a hit is exactly when a player is NOT standing
// still, so waiting for the plates would hide every one of them.
export const drawNumbers = (core: HudCore, frame: DashFrame): void => {
  const { dash } = core
  const { context, scale, state, font, heart } = frame
  const { plate: PLATE } = LAYOUT
  if (state.numbers.length > 0) {
    context.save()
    context.scale(scale, scale)
    const healHeart = {
      width: heart.width * PLATE.heart.scale,
      height: heart.height * PLATE.heart.scale
    }
    const space = font.measure(' ')
    for (const number of state.numbers) {
      // A HEAL comes up pink with a heart beside it, laid out the way the
      // plate's own health line is. Play: "сердечки рядом с цифрами, и
      // покрашено всё в розовый цвет" — and the exe carries exactly this
      // distinction, one argument of the number's own spawner
      // (lib/game/damage.ts).
      const healing = number.style === 'heal'
      const letters = healing ? (dash.healFont ?? font) : font
      const text = String(number.value)
      const wide = letters.measure(text) + (healing ? healHeart.width + space : 0)
      const left = Math.round(number.x / scale - wide / 2)
      const top = Math.round(number.y / scale - letters.height)
      context.globalAlpha = Math.max(0, 1 - number.age)
      if (healing) {
        context.drawImage(
          heart.image,
          left,
          top + Math.round((letters.height - healHeart.height) / 2),
          healHeart.width,
          healHeart.height
        )
      }
      letters.draw(context, text, healing ? left + healHeart.width + space : left, top)
    }
    context.restore()
  }
}

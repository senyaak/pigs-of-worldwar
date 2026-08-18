// The game's flat art, ready to blit.
//
// One call fetches a whole screen's worth — the frontend's out of FEBMP.MAD
// with the magenta key punched (lib/formats/alpha.ts for why the key is a
// colour and not an index), the battle's dashboard out of a TIM archive,
// where colour 0 already means see-through. Either way the archive is read
// once for the lot and each image becomes an ImageBitmap.

export interface Sprite {
  name: string
  width: number
  height: number
  image: ImageBitmap
}

export interface SpriteSet {
  /** By entry name without the extension: `fullmenu`, `chose1`. */
  get(name: string): Sprite
  /** A numbered animation: `frames('chose', 1, 6)` is chose1..chose6. */
  frames(prefix: string, from: number, to: number, digits?: number): Sprite[]
}

interface RawImage {
  name: string
  width: number
  height: number
  rgba: Uint8Array
}

/** Turn decoded images into blittable ones, looked up by name. */
export async function spriteSet(images: RawImage[]): Promise<SpriteSet> {
  const sprites = new Map<string, Sprite>()
  await Promise.all(
    images.map(async (image) => {
      const pixels = new Uint8ClampedArray(image.rgba.byteLength)
      pixels.set(image.rgba)
      const bitmap = await createImageBitmap(new ImageData(pixels, image.width, image.height))
      sprites.set(image.name.toLowerCase(), {
        name: image.name,
        width: image.width,
        height: image.height,
        image: bitmap
      })
    })
  )

  const get = (name: string): Sprite => {
    const sprite = sprites.get(name.toLowerCase())
    if (!sprite) throw new Error(`sprite ${name} was never loaded`)
    return sprite
  }
  return {
    get,
    frames(prefix, from, to, digits = 1) {
      const out: Sprite[] = []
      for (let i = from; i <= to; i++) out.push(get(`${prefix}${String(i).padStart(digits, '0')}`))
      return out
    }
  }
}

/**
 * The same sprite in a colour. Several pieces ship WHITE so the game can
 * paint them — the map markers, the angle fan — so this multiplies through,
 * keeping the shading and the alpha.
 */
export async function tinted(sprite: Sprite, colour: [number, number, number]): Promise<Sprite> {
  const canvas = new OffscreenCanvas(sprite.width, sprite.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2d context to tint with')
  context.drawImage(sprite.image, 0, 0)
  const pixels = context.getImageData(0, 0, sprite.width, sprite.height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      pixels.data[i + channel] = (pixels.data[i + channel] * colour[channel]) / 255
    }
  }
  context.putImageData(pixels, 0, 0)
  return { ...sprite, image: await createImageBitmap(canvas) }
}

/** Load the named FEBMP entries. Rejects if the archive has none of a name. */
export async function loadSprites(names: string[]): Promise<SpriteSet> {
  const result = await window.api.loadFrontendImages(names)
  if (!result.ok) throw new Error(result.error)
  return spriteSet(result.images)
}

/** Load every TIM in an archive — the dashboard, the message box. */
export async function loadTims(relPath: string): Promise<SpriteSet> {
  const result = await window.api.loadTims(relPath)
  if (!result.ok) throw new Error(result.error)
  return spriteSet(result.images)
}

/** Load every BMP in an archive — the skill menu's frame and its icons,
 * which ship as BMPs in a MAD rather than TIMs (main/assets.ts). */
export async function loadArchiveBmps(relPath: string): Promise<SpriteSet> {
  const result = await window.api.loadArchiveBmps(relPath)
  if (!result.ok) throw new Error(result.error)
  return spriteSet(result.images)
}

/** Load the DEBRIEF's loose BMPs — the one art folder that is not an
 * archive (Language/Tims/debrief, main/assets.ts). */
export async function loadDebriefSprites(names: string[]): Promise<SpriteSet> {
  const result = await window.api.loadDebriefImages(names)
  if (!result.ok) throw new Error(result.error)
  return spriteSet(result.images)
}

/** Loose BMPs out of any other Language/Tims folder — the pig map's world
 * picture, the briefing pages — punching only the `keyed` names. */
export async function loadLanguageSprites(
  folder: string,
  names: string[],
  keyed: string[] = []
): Promise<SpriteSet> {
  const result = await window.api.loadLanguageImages(folder, names, keyed)
  if (!result.ok) throw new Error(result.error)
  return spriteSet(result.images)
}

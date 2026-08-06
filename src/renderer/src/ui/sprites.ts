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

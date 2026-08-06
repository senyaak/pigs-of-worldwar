// The frontend's art, ready to blit.
//
// One call fetches a whole screen's worth out of FEBMP.MAD (the archive is
// read once for the lot) and turns each into an ImageBitmap with the magenta
// key already transparent — see lib/formats/alpha.ts for why the key is a
// colour and not an index.

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

/** Load the named FEBMP entries. Rejects if the archive has none of a name. */
export async function loadSprites(names: string[]): Promise<SpriteSet> {
  const result = await window.api.loadFrontendImages(names)
  if (!result.ok) throw new Error(result.error)

  const sprites = new Map<string, Sprite>()
  await Promise.all(
    result.images.map(async (image) => {
      const pixels = new Uint8ClampedArray(image.rgba.byteLength)
      pixels.set(image.rgba)
      const bitmap = await createImageBitmap(new ImageData(pixels, image.width, image.height))
      sprites.set(image.name, {
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

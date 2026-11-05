# B10. The map's red ground under a placed minefield

The reveal on the ground is built ([../facts/terrain.md](../facts/terrain.md)).
What is still open is the map view: `bomb` in MAPICONS.MTD has no reference
anywhere in `_d3d.dll`, because mines are a tile bit and not an object, so there
is nothing to hang a blip on. What the map does instead is bake the bit into its
own picture: `afInitScanner`'s fill loop writes a solid RED texel wherever
`flags & 0x40` is set (dll 0x1000A3E6), once, when the battle opens. So a placed
minefield is red ground on everybody's map with no class gate and no range, and
a mine LAID during play never appears there at all, because the texture is never
rebuilt (`scanner/visibility.md`).

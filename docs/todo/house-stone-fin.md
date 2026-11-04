# The house's corner stones reach past the wall

A wall's corner stones stand about 3 units past its end, a fin 1 to 2 pixels wide up
the wall's full height, at chase range or nearer
([../facts/wall-art.md](../facts/wall-art.md)). It comes from the half texel
`three/modelMesh.ts` adds to every UV. Whether the original draws it too is not
read: how the exe takes a prop's FAC UV to its texture page, `_d3d.dll` included.
Read that first, then keep the half texel or change it, which moves every model's
texture by a fraction of a texel.

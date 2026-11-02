# B6. The house's SEAMS still misbehave

"Всё ещё текстуры странно себя ведут на стыках дома." The per-record `renderOrder`
fixed the z-fight between the twelve COPLANAR pairs; something else is left. Two
candidates, **neither measured**: the 64-unit overlap itself (the faces are inside
each other, not merely touching), and texture bleed at the UV edges — the atlas
has no padding and the models' UVs are in pixels.

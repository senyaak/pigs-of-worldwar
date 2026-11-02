# B4b. ALT-TAB stops the battle but not the sergeant — written down, not built

Play, asked to be recorded for later: "в игре при альт-табе останавливается — пуля
например не летит дальше пока не вернусь, а вот инструктор говорит дальше — надо в
будущем паузу делать, эскейп меню, но это потом."

Exactly right, and half of it is already written up under "A frame is clamped to a
tenth of a second": the browser stops calling `requestAnimationFrame` for a window
nobody is looking at, so the ENGINE stands still while the audio — which is the
browser's own clock — plays on. The clamp only stops the world resolving a whole
alt-tab in one step; it is not a pause and does not pretend to be.

What the original has is a real one: the beat at the top of a turn lists the PAUSE
button as one of its three ways out (0x4d8a2c), and the mode machine carries **7 PC
PAUSE MODE** and **8 PAUSE MODE** beside it (`turns/notes.md`). So the escape menu
has a mode of its own to be built on. Singleplayer wants it; multiplayer wants
nothing of the kind ("в мп вообще никаких остановок"), which is the same split the
frame clamp already lives with.

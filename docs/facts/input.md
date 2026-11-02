# Input goes through the controller — including tests

`src/renderer/src/input/controller.ts` names what a player can do
(`walkForward`, `turnLeft`, `jump`, `endTurn`). Keys, on-screen buttons and
the e2e suite all call the same `press`/`release`/`tap`. **Never synthesise
key events in a spec** — that tests a parallel path, and a broken keybinding
would still pass. Use `e2e/controller.ts`. The one exception is a spec whose
SUBJECT is the keyboard, and there is exactly one
(`e2e/001/mapchain.spec.ts`); it says so in its own words.

**ONE keydown is ONE action, and one action reaches ONE view.** Every view
binds its own map on the same `window` gated on being the view that is up, and
that gate holds right until a view hands over SYNCHRONOUSLY — which the
briefing does, showing the battle from inside the dispatch. So the same Space
arrived twice: once as the briefing's `menuSelect`, once as the battle's
`jump`, which cut the squad's parachutes on the drop-in's first frame. Two
guards, because the leak has two halves: `bindKeyboard` calls
`stopImmediatePropagation` on any event it consumes, and `MENU_ACTIONS` keeps
the frontend's verbs out of the battle's queue, which no event listener could
have reached. `[play]`, and the exe agrees — its own canopy cut tests the pad
for a FRESH press (0x490c20).

**An action is SPENT the moment it changes the view.** `show()` calls
`controller.stopDispatch()`, which ends that action's delivery to the rest of
the listeners. The two-listener leak above is the keyboard half of this; the
half no event can reach is a view handing over inside one `fired()` pass, and
it bit twice — the battle queueing the briefing's key, then the briefing
taking the map's. Anything new that changes the view goes through `show()`,
which is where the rule lives.

# izzy_silver

Personal portfolio: a 3D photogrammetry scan of me as the hero, floating nav labels, and pages that transition in.
Vite + vanilla JS + Three.js + plain CSS. No framework.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run preview    # serve dist/ locally
```

## Deploy (Vercel or Netlify, no config)

Both auto-detect Vite: build command `npm run build`, output directory `dist`.

This project lives in a subfolder (`izzy-silver-site/`). If you push a parent folder that also holds the
Blender/FBX files, set the platform's **Root Directory** to `izzy-silver-site`. Easier: make this folder its own git repo.

## What's where

```
index.html                  hero markup: labels, canvas, and the empty page shells
src/main.js                 entry point
src/config.js               tuning knobs: clip names, timings, dance routine, camera speed, head stretch, floating things
src/scene/
  stage.js                  renderer, camera, orbit controls, lights
  character.js              GLB loading, hit volumes, foot-grounding
  animator.js               animation state machine (rest states, entrances, idle actions, one-shot sequences)
  picking.js                click vs drag, raycast hit-testing, hover cursor
  index.js                  boots everything, runs the render loop
src/features/
  dance-party.js            the Dance Party
  face-lift.js              say hi: the head you can stretch
  floating-things.js        my things: the floating objects (physics, dragging, tilt, opening one)
src/ui/                     nametag, interact menu, the phone-tilt reader (tilt.js) and the label sway (sway.js)
src/pages/                  page transitions (router.js) + the About, Photos, Say hi and My things pages
src/data/                   the text behind the pages (about.js, photos.js, contact.js, things.js)
src/styles/                 base / hero / floaters / party / pages
public/character.glb        the character (generated, see below)
public/head.glb             your head scan, for the say hi page (used as is: see "Say hi")
public/audio/               put dance.mp3 here
public/photos/              your photos (placeholder SVGs live here until you replace them)
scripts/prepare-character.mjs
```

## How the hero behaves

- **First time the home screen shows**, he **waves or salutes**, then settles into idle. It's picked at random but never the same as the
  last time the page was loaded (remembered in the browser's localStorage), so a reload always gives the other one. A page you
  deep-linked straight onto counts as not having seen the home screen yet, so the first return from it gets the greeting.
- **Each time you come back from a page**, he arrives a different way, picked at random (never the same twice in a row): a **swing
  to land** from above and behind, a **moonwalk** in from off-screen (it faces away from the centre and glides backwards, then
  turns to the camera), a **swim** toward the camera, or a **freehang climb** up over the floor line. Then idle, except after the
  swim: he **treads water indefinitely** until you click him. The camera turns to the front, unseen, while the page is still open,
  and holds still until he has arrived.
- **Click the character** to cycle `idle -> wave -> spin -> idle`. A drag (rotating the camera) is not a click, and a click during an
  entrance, an idle action or the water-treading takes over from it (treading water goes to idle). Wave and spin play slower than
  the raw clips: `SPEED`.
- **Idle actions:** after 10 seconds standing in idle he does one of `IDLE_ACTIONS` (*shooting arrow*, *saluting*, *waving*), picked
  at random and never the same one twice in a row, then goes back to idle and the 10 seconds start again. An action can have a
  `cooldown`: once he has shot the arrow he can't again for 20 seconds (which starts when he finishes), so it comes round about
  once every 40 s rather than every 15.
- The camera orbits slowly on its own; drag to take over, and it resumes ~3.5 s after you let go.
- **interact** opens a menu. Right now it has **Dance Party**: the page goes dark, a colored spotlight comes on and cycles
  colors, and the character runs `hip hop dancing -> dancing -> samba dancing`. Each clip plays once, and the next one
  starts on the mixer's `finished` event. When the last one ends, everything fades back and the character returns to
  whichever state it was in before. Press **Esc** (or the button) to stop early.
- Clicking a floating label (**about me, say hi, photos, my things**) opens its page; see "Pages and transitions" below.
- The nametag follows the head bone and fades out after 3 s without pointer movement.

### The labels

The five floating labels are big (about 36px on a laptop), sit well out from the body and float in a slow loop that drifts up,
sideways and back with a hint of tilt. Hovering (or keyboard-focusing) one makes it **glow** (white; teal for *interact*).

- Where each one sits is a few numbers in its `style` in `index.html`: `--h` (height on the character), `--want` (how far from the
  centre line it would like to be), `--chars` / `--chars-short` (how many letters, so the CSS can stop a label being pushed off a
  narrow screen), `--bob` / `--bob-delay` / `--amp` (the float's speed, phase and size) and `--depth` (how far it sways on a phone).
  The size is `--label-size` in `floaters.css`.
- **On a phone the labels sway with its movement** (`src/ui/sway.js`): tip or move the phone and each label leans that way, overshoots
  a little and settles, each on its own spring. Only *changes* in tilt count (a phone held still at any angle reads as level), and each
  label is stopped from leaving the screen. Knobs: `SWAY` and `TILT` in `src/config.js`. iPhones only allow reading the sensor after a
  tap, so the first tap on the home screen that isn't on a label asks; other phones start straight away. It needs HTTPS (any real
  deploy), does nothing on a desktop, and is off for visitors who ask for reduced motion. The same reader powers the tilt on *my things*.

## The character file

`public/character.glb` is **generated** from your Blender export by `scripts/prepare-character.mjs`. Reason: the raw
export has one armature per clip and the mesh is bound to only the first, so only one clip would move the character.
The script retargets every clip onto the mesh's skeleton (by bone name), drops the unused armatures, and compresses
textures and geometry (20 MB -> ~3.7 MB). Your original is never modified.

Re-run it whenever you re-export from Blender:

```bash
npm run prep:character                      # reads ../izzy_w_animation_rigging_2.glb
npm run prep:character -- path/to/new.glb   # or point at another file
```

**The loading still.** While the 3D character downloads, a flat, dimmed picture of him (`public/character-poster.webp`, ~20 KB)
stands exactly where he'll appear, and fades out as he fades in. It's rendered from the real model, so re-make it after
re-running the script: with `npm run dev` going, open **http://localhost:5173/?poster**. It renders his first idle frame from
the front, crops it to the poster's box, and the dev server saves it (the screen says "poster saved"). Reload without `?poster`.

Clip names in `src/config.js` must match the names inside the GLB. The current file has 20 clips; two aren't used: `entry` (an
11-second strut in a circle that starts and ends 1.65 m behind the centre, so it would need its own staging) and `mixamo.com` (an
older, in-place swim).

**Adding an animation:** export it from Mixamo (FBX, *without skin* is fine), import it into the same Blender file so it becomes
another armature + action, name the action, re-export the GLB and run the script. Then use it in `src/config.js`: as a rest state
(`CLIPS` + `REST_CYCLE`), an entrance (`ENTRANCES` + `FIRST_ENTRANCES` / `RETURN_ENTRANCES`; an entrance can end in a rest state
other than idle with `after`) or an idle action (`IDLE_ACTIONS`, each with an optional `cooldown`, `loops` and `speed`).

**How entrances handle travel.** Some clips move the character through space (the swing lands 5 m from where it starts, the climb
rises 2.7 m). At start-up `measureAnchors` (in `character.js`) finds where each such clip's *last* frame puts him and shifts the
whole clip so that frame lands at the centre, on the floor; `anchor: 'xz'` (the swim) leaves the height alone. The moonwalk clip
plays in place, so the animator slides it in from just off-screen at a steady `travel.speed`, repeating the clip as many times as the
distance needs (fewer on a phone). All of it is blended with the crossfades, so he never pops.

## Dance Party music

Add your own file at `public/audio/dance.mp3`. If it's missing the party runs silently, nothing breaks.

Heads up: hosting a copyrighted track (e.g. Daft Punk's "Around the World") on a public site can get flagged or taken down.
For the deployed version, consider a track you have the rights to.

## Pages and transitions

Every page's header lives in the same spot, bottom-right (`header: 'aside-bottom'`, the `data-pose` rule in `pages.css`) —
all built with plain DOM + Web Animations API in `src/pages/router.js`.

**Opening a page from home** (click a floating label):

1. the clicked label becomes the page header: it grows to about twice its size (`--header-size` in `pages.css`) and travels
   to the bottom-right spot
2. the character, nametag and floor glow fade out; every other label — **interact** included — slides off through
   whichever screen edge it's nearest to, fading as it goes (~420 ms)
3. once off-screen, those same labels are silently repositioned onto the (still invisible) page menu — see below
4. the page's blocks fade + slide in from the left, one after another

There's no back arrow: **going home** ("homepage" in the menu, **Esc**, or the browser's back button) plays the same shape in
reverse: the header — and its whole stack, if the menu happened to be open — slides off the right edge, then every home
label drifts back in from its nearest edge, staggered. The render loop wakes as closing begins, so the character fades in
as a live frame. `/#about` and `/#photos` deep-link straight onto a page, and typing a page's hash into the address bar
while the site is open (or following a plain `#photos` link) goes there too: opening it, or switching to it if a page is
already open. The browser's back / forward step through those the same way, and going home always lands on the home
screen however many were typed in (each history entry remembers how far it is from home). Timings are the `T` object at
the top of `router.js`. The 3D scene pauses rendering while a page is open.

**The page menu:** hovering (or keyboard-focusing) the header reveals the other pages — plus a teal **homepage** entry —
stacked above it in a fixed order (`MENU_ORDER` in `router.js`), indented in a zig-zag. It's built from the same label
elements that float on the home screen, just tagged `.is-menu-item` and repositioned by transform. Clicking another entry
swaps pages without going home: the picked label grows into the header, the old header shrinks into its new stack slot, and
the rest of the stack rearranges around them while the two pages' content crossfades. Switching never blocks: you can click
another entry at any moment and everything in motion is picked up from wherever it is and redirected. The menu stays open
throughout. Clicking **homepage** (or **Esc**, which closes the menu first if it's open) goes home as above. On a device with no
hover, tapping the header toggles the menu instead, and tapping outside it closes it. From the keyboard, **↑ / ↓** (and
**Home / End**) move through the menu in the order it's drawn, top to bottom; Tab still follows the page's order. While the
menu is open the page underneath dims to 40% (`.hero.is-menu-open .page` in `pages.css`).

A page is just `{ render(page), blocks(page), stagger?, header?, exit?, onShow?(page), onHide?(page), back?(page), preload?() }`
registered in `src/pages/index.js`; `blocks` returns the elements that animate in, in order, and `onShow` / `onHide` are for pages
that run something while they're open (the photo drift, the head, the floating objects). `exit` says how the content leaves: by
default the blocks in reverse, sliding left. Photos overrides it to fade every photo *currently on screen*, left to right, because
the drifting rows show copies of the photos and not just the real set (or the carousel, if it's open).

- `onHide` may return a promise. The router waits for it (along with the content leaving) before it moves on — my things uses
  it to close whatever object is open.
- `back` gets the first press of **Esc** (once any open menu has been closed) and returns `true` if it handled it. My things
  uses it to close an open object first, and photos to close its carousel; only a press it doesn't handle closes the page.
- `preload` runs once the hero is up and the browser is idle (main.js), so a page can fetch what it needs ahead of time
  (say hi fetches the head scan). It's skipped when the visitor has "save data" on.
- `header` is `'aside-bottom'` on every page now — it's still a per-page field in case a page ever needs to opt out.

`src/pages/coming-soon.js` is a one-line stand-in for a page that has no content yet (nothing uses it right now).

## Say hi

Your head scan in the middle (`public/head.glb`), in the style of the SM64 "Face Lift" toy, with your contact details underneath.

- **Press on the head and drag** to grab that spot of the surface and stretch it: everything within `radius` of the spot follows
  the pointer, most at the spot and less and less toward the edge (a smooth bump, so it pulls like rubber and never comes to a
  point). The stretch stays until you reset it: **right-click** or the **reset** button (the head eases back, exactly, over `resetMs`).
- **Press on empty space and drag** to orbit the camera a little way either side (the scan is open at the back).
- The light drifts slowly from side to side, which is what makes the stretched surface read as 3D.
- The knobs are `FACE_LIFT` in `src/config.js`: `radius`, `maxPull`, `follow` (how gooey it feels), `resetMs`, how big the head is on
  screen, `swing`, and `turn` if a new scan ever comes out facing the wrong way.
- To use a different scan, replace `public/head.glb`. It is centred, scaled and un-rotated when it loads, so no preparation is needed.
- **Your LinkedIn address goes in `src/data/contact.js`.** Until it's filled in, "linkedin" shows as plain text rather than a dead link.
  The email there is a `mailto:` link.

## My things

Objects floating around like they're loose in a space station (the "projects" page, renamed). It's one Three.js canvas over the whole
page; everything on it is measured in screen pixels.

- Objects drift on their own, tumble slowly, and bounce off invisible walls at the edges of the screen and off each other.
- **Drag one and let go**: it keeps the direction and speed you let go with and only slowly settles back to a drift (`damping`).
- **The header is a wall too**: objects bounce off its rectangle so they never drift behind the text. It used to float around
  as one more body itself, but the router now keeps every page's header pinned in place (so hovering it to open the page
  menu is reliable) — `floating-things.js`'s `start()` takes a `static` option (on by default) that keeps it from drifting
  while still colliding.
- **Click one** (a press that hardly moves): the others fade away and it swings over to the left, big, spinning slowly. Its title and
  description appear on the right. Drag it to spin it. **Tap the empty space** or press **Esc** to put it back; the next
  Esc leaves the page.
- **On a phone, tilting the phone pushes everything.** Only *changes* in tilt count (a phone held at any angle is still, because the
  "normal" tilt slowly follows however you hold it), so it feels like you're moving the space station around them. iPhones only allow
  this after a tap, so a **tilt to move** button appears there; Android and others start straight away. It needs HTTPS (any real
  deploy) and does nothing on desktops.
- The knobs are `THINGS` in `src/config.js`: sizes, drift speeds, `damping`, `bounce`, `maxSpeed`, `tilt`, `tiltSettle`. `left` moves the
  objects' left wall (0 is the screen's edge; `0.4` keeps them all on the right side).
- The keyboard gets the same objects as a row of buttons (Tab to reach them), and there's a `prefers-reduced-motion` mode: no
  drifting or tilt, but objects can still be dragged and opened.

**Adding your own things** is `src/data/things.js`: one entry per object, with a `title`, `description`, and a placeholder `shape` /
`color`. Give an entry `model: 'models/controller.glb'` (a .glb in `public/models/`) and that replaces the placeholder. Models are
centred and scaled to fit their circle automatically, so any size and origin will do; if an elongated model looks small, raise its
`size`. Adding an entry adds an object (the first five start where the design has them, the rest are scattered).

## Editing content

- **About Me:** `src/data/about.js` (two photos + one entry per paragraph; each paragraph is its own staggered block).
  The layout (photo sizes, text width, where the header goes) is the About section of `pages.css`; the text width is in
  `em` so the lines break in the same places at any screen size.
- **Photos:** `src/data/photos.js`. Each photo has a `src`, `alt`, a `caption` (its description) and an optional `shape`:
  `'wide'` (4:3, the default) or `'tall'` (3:4). The page is the "Photos Board" design, variant 7a ("grow"), from Claude
  Design. Two full-width rows (first half of the photos on top) drift to the right and loop, each on its own, the bottom
  one a little slower; they keep drifting under the pointer (only the carousel stops them). Hovering a photo fades in a dark gradient with
  its description. Clicking one lifts it out of its row and grows it into the centre while the rows fade; its neighbours
  (shaded, at the screen edges) and the description fade in as it arrives. Click a neighbour or use ← / → to move (it
  loops); **Esc** or a click on the background flies it back into the rows. All sizes come from the design's 1280×800 board
  and scale with the window (`--u`); the knobs are at the top of `src/pages/photos.js` (`DRIFT`, `ROW_SPEED`, `T`, ...).
  Nothing drifts if the visitor has "reduce motion" on. Phones get a plain two-column grid instead of the rows; the
  carousel works the same there.
- **Adding real photos (About and Photos):** put the originals in `photos-src/` (not served, so any size is fine; export
  iPhone HEICs as JPEG first) and run `npm run prep:photos`. Each one becomes 800px and 1600px wide AVIF + WebP files in
  `public/photos/`, turned the right way up and stripped of location/camera data, and the script prints whether each is
  `'tall'` or `'wide'`. Then point the data at the name **without an extension**, e.g. `{ src: 'photos/beach', ... }`, and
  the browser picks the smallest file that's still sharp (`src/ui/image.js`). A `src` with an extension is used as-is (the
  placeholder SVGs, which can be deleted once you've replaced them). Re-run the script after adding more; finished ones are skipped.
- **Say hi:** `src/data/contact.js` (email and LinkedIn). **My things:** `src/data/things.js`. See those two sections above.
- The About text currently uses the wording from your reference screenshot. Change it freely.

## Adding the other interact options later

1. Add an entry to `ITEMS` in `src/ui/interact-menu.js` (the commented ones are ready to uncomment).
2. Register its handler in `src/scene/index.js`: `menu.on('standoff', () => ...)`.
3. The animator already has `playSequence(...)` for one-shot clips; the GLB already contains `dying`, `warrior idle`,
   `shooting arrow`, `saluting` and `male lying pose` for the stand-off.

### Planned (waiting on assets)

- **Stand-off** (western): everything on the page disappears and the character gets ready to draw. A tumbleweed blows
  by. Press **Space** to draw before he does.
  - He wins: camera shakes, you fall over, GTA-style "WASTED" screen.
  - You win: he falls over and dies, a comedic pause, then everything reappears with him still dead.
- **Compliment**: the character blushes and replies as if you'd said something outlandish, e.g.
  "thanks, i take great pride in my ingrown toe nails :)".
- **Study**: papers fall from the top of the screen until it's full; behind them the character is revealed studying at a
  desk, facing away from the camera. The interact options stay available.

## Debugging

- `http://localhost:5173/?hit` draws the invisible hit volumes used for click / hover detection.
- In dev, `window.__izzy` exposes the stage, character, animator (`playEntrance('moonwalk')`, `cycle()`), the measured `anchors`,
  `enter()` (a random entrance, as on returning from a page) and party; `window.__hi` the head (`step`, `render`, `reset`,
  `deformed`); `window.__things` the floating objects (`bodies`, `header`, `select(id)`, `step`, `draw`); `window.__router`
  the router (`open(id)`, `close()`, `isOpen`) — the page menu itself (`openMenu`/`closeMenu`/`switchTo`) is internal to
  the closure, so drive it through real hover/click/focus events, or a dispatched `pointermove` on the header's label.
- A browser tab/pane that's hidden (backgrounded) can stall `element.animate().finished` indefinitely, since the compositor
  isn't painting — an `await`ed router call can hang until the tab is visible again. Fire it without awaiting
  (`window.__router.open('about')`, no `await`) and poll state separately if you're driving the router from a background tab.

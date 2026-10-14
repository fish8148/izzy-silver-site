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
public/photos/              your photos, as made by `npm run prep:photos`
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
- Clicking a floating label (**about me, say hi, photos**) opens its page; see "Pages and transitions" below. (**My things** is switched off for now: its code is all still here, and `src/pages/index.js` says how to turn it back on.)
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

Pages have no header or menu of their own: you move around with the edge menu, by scrolling / swiping past a page's end,
**Esc**, or the browser's back button (see "Edge menu" and "Scrolling and touch" below). All built with plain DOM + Web
Animations API in `src/pages/router.js`.

**Opening a page from home** (click a floating label):

1. the character, nametag and floor glow fade out; every label — **interact** and the clicked one included — slides off
   through whichever screen edge it's nearest to, fading as it goes (~420 ms)
2. the page's blocks fade + slide in from the left, one after another

**Going home** ("homepage" in the edge menu, **Esc**, or the browser's back button) plays it in reverse: the content leaves,
then every home label drifts back in from its nearest edge, staggered. The render loop wakes as closing begins, so the
character fades in as a live frame. **Switching** straight from one page to another crossfades their content and never
blocks. `/#about` and `/#photos` deep-link straight onto a page, and typing a page's hash into the address bar while the
site is open (or following a plain `#photos` link) goes there too. The browser's back / forward step through those the same
way, and going home always lands on the home screen however many were typed in (each history entry remembers how far it is
from home). Timings are the `T` object at the top of `router.js`. The 3D scene pauses rendering while a page is open.

A page is just `{ render(page), blocks(page), stagger?, exit?, onShow?(page), onHide?(page), back?(page), preload?() }`
registered in `src/pages/index.js`; `blocks` returns the elements that animate in, in order, and `onShow` / `onHide` are for pages
that run something while they're open (the photo drift, the head, the floating objects). `exit` says how the content leaves: by
default the blocks in reverse, sliding left. Photos overrides it to fade every photo *currently on screen*, left to right, because
the drifting rows show copies of the photos and not just the real set (or the carousel, if it's open).

- `onHide` may return a promise. The router waits for it (along with the content leaving) before it moves on — my things uses
  it to close whatever object is open.
- `back` gets the first press of **Esc** (once the edge menu, if open, has been closed) and returns `true` if it handled it. My things
  uses it to close an open object first, and photos to close its carousel; only a press it doesn't handle closes the page.
- `preload` runs once the hero is up and the browser is idle (main.js), so a page can fetch what it needs ahead of time
  (say hi fetches the head scan). It's skipped when the visitor has "save data" on.

`src/pages/coming-soon.js` is a one-line stand-in for a page that has no content yet (nothing uses it right now).

## Say hi

The "Note" layout (handoff 20b, `design-ref/say-hi-ref/`). On the left, a contact form written as a sentence ("hi izzy, i'm ___ and
you can reach me at ___"), a message box, a send button (enabled once there's a message) and "or email <address> click to copy".
On the right, the home screen's character in a dark panel (`src/features/panel-character.js`): his own small stage, the same
model and the same behaviour as at home (idle, with the odd idle action; click him for idle → wave → spin; drag to turn), minus
the arrivals and the party. The links sit under the panel. Under 960px it stacks and scrolls.

- **Where messages go:** `formEndpoint` in `src/data/contact.js`. **Empty for now**, so the button reads "send by email ↗": it opens a
  new email to you in the visitor's own mail app with their message filled in, and the thank-you says "your email app should
  open with it ready to send." Set `formEndpoint` to a form service's URL (a Formspree form, e.g. `https://formspree.io/f/abcdwxyz`,
  works as is: it's sent `{ name, email, message }` as JSON) and the button becomes "send ↗", messages arrive in your inbox, and the
  thank-you says "i'll get back to you soon." A failed send keeps the form as it was and says "couldn't send, try emailing instead."
- **The links (linkedin, github, instagram) are `links` in `src/data/contact.js`.** One with no `href` is left off the page.
- **The stretchy head scan** (`src/features/face-lift.js`, `public/head.glb`, `FACE_LIFT` in `src/config.js`) is set aside for now, not
  deleted. Its knobs and behaviour are documented in that file.

## My things

Objects floating around like they're loose in a space station (the "projects" page, renamed). It's one Three.js canvas over the whole
page; everything on it is measured in screen pixels.

- Objects drift on their own, tumble slowly, and bounce off invisible walls at the edges of the screen and off each other.
- **Drag one and let go**: it keeps the direction and speed you let go with and only slowly settles back to a drift (`damping`).
- Pages no longer have a header, so `start({})` is called with no header rectangle. (`floating-things.js` still supports one:
  pass `{ floater, label }` and the objects bounce off it.)
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

- **About Me:** `src/data/about.js`: the intro paragraphs, the portrait, the resume link (`resume`, opened in a new tab;
  put the file at `public/resume.pdf` or use a full URL) and the highlights (`name`, `role`, `description`, `photos`). The
  page is the "Editorial" design (14a): the intro set large beside the portrait, then each highlight with its name pinned on
  the left while its photos (wide, half, half, wide, repeating) scroll past on the right, then a large resume link. Empty
  descriptions and photo lists show nothing. The look is the About section of `pages.css`; under 960px it's one column.
- **Photos:** `src/data/photo-trips.js`, grouped by trip: each trip has a `slug`, a lowercase `name`, a `description`
  (1–2 sentences, or `''` for none) and its `photos`, each `{ src, shape, caption, alt? }` (`src` is the name in
  `public/photos` without size/extension; `shape` is `'wide'` or `'tall'`, as `npm run prep:photos` prints it). The page is
  the "scroll-synced index" design (13a): the trips' names stay fixed on the left, the photos scroll as one run of chapters
  on the right (a 3-column grid; the first photo of each trip is big), and the trip you're scrolled into turns blue, steps
  in and opens its description. Click a name to scroll to that trip. Hovering a photo shows its caption; clicking it grows
  it into the viewer, which moves within that trip only (← / →, a neighbour, a swipe or a sideways scroll; it loops), and
  **Esc** or a background click flies it back. Under 900px the index becomes a row of names along the top and the grid two
  columns. Scrolling past the bottom of the chapters pulls in the next page, as anywhere else. Knobs are at the top of
  `src/pages/photos.js` (`ACTIVATE`, `SPANS`, ...); the look is the photos section of `pages.css`.
- **Adding real photos (About and Photos):** put the originals in `photos-src/` (not served, so any size is fine; export
  iPhone HEICs as JPEG first) and run `npm run prep:photos`. Each one becomes 800px and 1600px wide AVIF + WebP files in
  `public/photos/`, turned the right way up and stripped of location/camera data, and the script prints whether each is
  `'tall'` or `'wide'`. Then point the data at the name **without an extension**, e.g. `{ src: 'photos/beach', ... }`, and
  the browser picks the smallest file that's still sharp (`src/ui/image.js`). A `src` with an extension is used as-is. Re-run the script after adding more; finished ones are skipped.
- **Say hi:** `src/data/contact.js` (email, links, and where messages go). **My things:** `src/data/things.js`. See those two sections above.

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
  the router (`open(id)`, `close()`, `go(id)`, `currentId`, `isOpen`).
- A browser tab/pane that's hidden (backgrounded) can stall `element.animate().finished` indefinitely, since the compositor
  isn't painting — an `await`ed router call can hang until the tab is visible again. Fire it without awaiting
  (`window.__router.open('about')`, no `await`) and poll state separately if you're driving the router from a background tab.

## Scrolling and touch

- **Photo viewer**: swipe or scroll sideways to move along (as well as the arrow keys and clicking a neighbour).
- **Photos on phones** (under 900px): the trips' names become a row along the top, each trip's description sits in its chapter under its name, and the grid is 2 columns.
- **Pages** (About, say hi on a phone) scroll inside themselves.
- **The edge menu on a touch screen**: tap within 18px of the left or right edge. That tap (and the one that closes it) is the menu's alone: it never also presses what's underneath.
- A landscape phone no longer forces the whole page to scroll: the hero fits the screen and the content scrolls inside it.
- **Scrolling through the pages** (mouse / trackpad): keep scrolling past the end of a page and a glowing bar (like the edge menu's seams) rises on that edge, with the next page's name beside it. The further you pull, the longer and brighter it gets, and it bows in toward the middle like a stretched band (turning light blue at a full pull). Let go early and it springs back. At a full pull the "drop" row plays (handoff 16a): the page fades to black while a row of the page names drops in, the current one blue; the blue hands over to the next page (it hops up, the current one dips), the names fall away and the black lifts on the new page. It only ever moves one page, however long you keep scrolling. Scrolling up past the top goes back. Order: homepage → about me → photos → say hi. ↑ ↓ PgUp PgDn Space work too at a page's edge. While the edge menu is open by hand, scrolling walks it instead: every ~90px moves the blue one page and the page follows behind the menu. The numbers are in `PULL` and `BAR` at the top of `src/ui/scroll-pull.js`. On a touch screen it works the same way by dragging past a page's end: the bar follows the finger and holds while it's down, and a full pull is about a third of the screen's height (`touchReach`). Sideways swipes never pull. The page order (for the edge menu and the pull) is `src/pages/order.js`.

## Edge menu

Push the cursor against the left or right edge of the screen (a 24px strip) and the pages slide out from that edge: `homepage`, `about me`, `photos`, `say hi`, in a straight column down nearly the full height of the screen (clamped so nothing clips), over a dark shade. The page you're on is light blue. A thin glowing seam rests on each edge so you know it's there; it breathes, and reaches toward the cursor as it nears the edge. It folds away 300ms after the cursor leaves it. (`src/ui/edge-menu.js`, `src/styles/edge-menu.css`).

On a touch screen, tap right at the left or right edge (where the seams are) to open it; tap anywhere else to close it. Pages have no header of their own any more: the edge menu, scrolling / swiping past a page's end, Esc and the browser's back button are how you move around.

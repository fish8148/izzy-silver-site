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
index.html                  the page shells (about me, say hi, photos)
src/main.js                 entry point
src/config.js               tuning knobs: clip names, the click cycle, the arrivals, dance routine, camera speed, floating things
src/scene/
  stage.js                  renderer, camera, orbit controls, lights
  character.js              GLB loading, copies of the character, hit volumes, foot-grounding
  animator.js               animation state machine (rest states, entrances, idle actions, one-shot sequences)
  picking.js                click vs drag, raycast hit-testing, hover cursor
src/features/
  panel-character.js        the character on a page: arrivals, the click cycle, the dance party lights
  face-lift.js              the stretchy head (set aside)
  floating-things.js        my things: the floating objects (physics, dragging, tilt, opening one)
src/ui/                     the scroll pull (scroll-pull.js), images, the phone-tilt reader (tilt.js)
src/pages/                  which page shows (router.js), the page order (order.js), the character on a page
                            (page-character.js) + the About, Photos, Say hi and My things pages
src/data/                   the text behind the pages (about.js, photos.js, contact.js, things.js)
src/styles/                 base / hero (the shell) / pages / pull (the scroll pull's bar)
public/character.glb        the character (generated, see below)
public/head.glb             your head scan, for the stretchy head (set aside)
public/photos/              your photos, as made by `npm run prep:photos`
scripts/prepare-character.mjs
```

## The character

There's no home screen any more: the 3D character stands on **about me** (beside the intro) and on **say hi** (beside the form),
straight on the black page with no panel. Each page has its own copy (`cloneCharacter` in `character.js`: one download, the
mesh and textures shared, its own skeleton and animations), set up by `src/features/panel-character.js` and
`src/pages/page-character.js`.

- **Every time one of those pages is shown, he arrives with the next opener** (`OPENERS` in `src/config.js`): a **wave**, a
  **salute**, a **swing to land**, a **moonwalk** in from the side, a **swim** (after which he **treads water** until clicked),
  a **freehang climb** up over the floor line, or the **dance party**. The order is shuffled, played through to the end, then
  shuffled again (never the same one twice across the seam). It's shared by both pages and remembered in the browser's
  localStorage (`izzy_silver:openers`), so it carries on across visits. Visitors who ask for reduced motion only get the wave
  and salute (`CALM_OPENERS`).
- **Click him** to walk `CLICK_CYCLE`: idle → wave → spin (hurricane kick) → shooting arrow → warrior idle → moonwalk (in
  place) → **dance party** → salute → idle… A string is a resting state that keeps playing until the next click; an object
  plays once then goes back to idle. A drag (turning the camera) is not a click, and a click always interrupts whatever he's doing
  (an arrival, an idle action, the arrow, the dance) and moves on to the next one (treading water goes to idle). (The
  breakdance freeze and dying were tried and left out: both travel too far for the character's column and drift out of view.)
- **The dance party**: `hip hop dancing → dancing → samba dancing`, each once, the next starting on the mixer's `finished`
  event, while the page's lights go dark and colourful (a coloured spotlight, the key and rim lights cycling hue on the beat).
  Then everything fades back and he idles.
- **Idle actions:** after 10 seconds standing in idle he does one of `IDLE_ACTIONS` (*shooting arrow*, *saluting*, *waving*),
  never the same one twice in a row. An action can have a `cooldown` (the arrow: 20 s).
- The camera orbits slowly on its own; drag sideways to take over, and it resumes ~3.5 s after you let go. A vertical drag or
  the wheel over him still scrolls the page.
- **He isn't boxed in.** His canvas reaches well past his column (240px to each side, 140px above: `--over-*` in `pages.css`)
  and fades out at its edges, so kicks, swings and the moonwalk are never cut off in a straight line; he may pass over a few
  words for a moment. The canvas lets the mouse through, and his column takes the clicks and drags, so the text and form
  under him stay usable. The moonwalk starts just outside his column, so it only crosses a little of the page.
- He renders only while his page is showing. About me is the first page, so the model loads there; the canvas fades in on his
  first frame.

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

Clip names in `src/config.js` must match the names inside the GLB. The current file has 20 clips; two aren't used: `entry` (an
11-second strut in a circle that starts and ends 1.65 m behind the centre, so it would need its own staging) and `mixamo.com` (an
older, in-place swim).

**Adding an animation:** export it from Mixamo (FBX, *without skin* is fine), import it into the same Blender file so it becomes
another armature + action, name the action, re-export the GLB and run the script. Then use it in `src/config.js`: in the click cycle
(`CLIPS` + `CLICK_CYCLE`), as an arrival (`ENTRANCES` + `OPENERS`; an entrance can end in a rest state other than idle with
`after`) or an idle action (`IDLE_ACTIONS`, each with an optional `cooldown`, `loops` and `speed`). Check it stays inside the
character's column: clips that travel need an `anchor` (see below).

**How entrances handle travel.** Some clips move the character through space (the swing lands 5 m from where it starts, the climb
rises 2.7 m). At start-up `measureAnchors` (in `character.js`) finds where each such clip's *last* frame puts him and shifts the
whole clip so that frame lands at the centre, on the floor; `anchor: 'xz'` (the swim) leaves the height alone. The moonwalk clip
plays in place, so the animator slides it in from just off-screen at a steady `travel.speed`, repeating the clip as many times as the
distance needs (fewer on a phone). All of it is blended with the crossfades, so he never pops.

## Pages

There is no home screen: the site opens on **about me** (or on the page in the address: `/#photos`, `/#say-hi`). You move
between pages by scrolling / swiping past a page's end (see "Scrolling and touch"), with links inside the pages (about me's
**say hi →**), or with the browser's back / forward (each switch is a history entry). **Switching is instant**: no
transition, the old page is hidden and the new one shown. Only the first page, as the site loads, fades its blocks in.
All in `src/pages/router.js`; the page order is `src/pages/order.js`.

A page is just `{ render(page), blocks(page), stagger?, onShow?(page), onHide?(page), back?(page), preload?() }` registered
in `src/pages/index.js`; `blocks` returns the elements that fade in on first load, in order, and `onShow` / `onHide` are for
pages that run something while they're showing (the photo drift, the character, the floating objects).

- `back` gets **Esc**: photos uses it to close its carousel, my things to close an open object.
- `preload` runs once the browser is idle (main.js), so a page can fetch what it needs ahead of time (about me and say hi
  fetch the character; on a phone, only the code). It's skipped when the visitor has "save data" on.
- A `#page` link inside a page (like `href="#say-hi"`) switches to that page in place.

## Say hi

The "Intro form" layout (handoff 25a, `design-ref/say hi 25a.zip`), set like about me's intro. On the left, a contact form
written as a sentence ("hi izzy, i'm ___ and you can reach me at ___"), a message box, then one row of text links:
**send by email ↗** (blue; grey until there's a message), then the `links` from `contact.js` and **resume ↗** (white, blue on
hover), with "or copy <address> click to copy" under it. On the right, the character (see "The character"), framed the same
as on about me, with no panel. Under 960px it's one column, the character above the form.

- **Where messages go:** `formEndpoint` in `src/data/contact.js`. **Empty for now**, so the button reads "send by email ↗": it opens a
  new email to you in the visitor's own mail app with their message filled in, and the thank-you says "your email app should
  open with it ready to send." Set `formEndpoint` to a form service's URL (a Formspree form, e.g. `https://formspree.io/f/abcdwxyz`,
  works as is: it's sent `{ name, email, message }` as JSON) and the button becomes "send ↗", messages arrive in your inbox, and the
  thank-you says "i'll get back to you soon." A failed send keeps the form as it was and says "couldn't send, try emailing instead."
- **The links (linkedin, github, instagram) are `links` in `src/data/contact.js`.** One with no `href` is left off the page (github and instagram are empty for now). The resume link is shared with about me (`src/ui/resume.js`).
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

- **About Me:** `src/data/about.js`: the intro paragraphs, the resume link (`resume`, opened in a new tab;
  put the file at `public/resume.pdf` or use a full URL) and the highlights (`name`, `role`, `description`, `photos`). The
  page is the "Editorial" design (14a, with the character from 24b "Standing"): the intro set large with "resume ↗" and
  "say hi →" under it, the 3D character standing beside it (above it under 960px), then each highlight with its name pinned on
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

## Planned (waiting on assets; these were "interact" options on the old home screen)

- **Stand-off** (western): everything on the page disappears and the character gets ready to draw. A tumbleweed blows
  by. Press **Space** to draw before he does.
  - He wins: camera shakes, you fall over, GTA-style "WASTED" screen.
  - You win: he falls over and dies, a comedic pause, then everything reappears with him still dead.
- **Compliment**: the character blushes and replies as if you'd said something outlandish, e.g.
  "thanks, i take great pride in my ingrown toe nails :)".
- **Study**: papers fall from the top of the screen until it's full; behind them the character is revealed studying at a
  desk, facing away from the camera.

## Debugging

- `http://localhost:5173/?hit` draws the invisible hit volumes used for click / hover detection.
- In dev, `window.__characters` holds each page's character by its canvas's class (`about-intro__canvas`, `hi-canvas`):
  `animator` (`playEntrance('moonwalk')`, `playRest('spin')`, `getState()`), `click()`, `reset()` (the next opener), `stage`;
  `window.__things` the floating objects; `window.__router` the router (`go(id)`, `currentId`).
- A browser tab/pane that's hidden (backgrounded) pauses `requestAnimationFrame`, so the character and the pull bar stop
  drawing. To test animation logic there, `stop()` the character and call `animator.update(1/30)` in a loop yourself.

## Scrolling and touch

- **Photo viewer**: swipe or scroll sideways to move along (as well as the arrow keys and clicking a neighbour).
- **Photos on phones** (under 900px): the trips' names become a row along the top, each trip's description sits in its chapter under its name, and the grid is 2 columns.
- **Pages** (About, say hi on a phone) scroll inside themselves.
- A landscape phone no longer forces the whole page to scroll: the hero fits the screen and the content scrolls inside it.
- **Scrolling through the pages** (mouse / trackpad): keep scrolling past the end of a page and a glowing bar rises on that edge, with the next page's name beside it. The further you pull, the longer and brighter it gets, and it bows in toward the middle like a stretched band (turning light blue at a full pull). Let go early and it springs back. At a full pull the next page is simply there (no transition), at its top (or its bottom, going back). It only ever moves one page, however long you keep scrolling. Scrolling up past the top goes back. Order: about me → photos → say hi (`src/pages/order.js`). ↑ ↓ PgUp PgDn Space work too at a page's edge. The numbers are in `PULL` and `BAR` at the top of `src/ui/scroll-pull.js`. On a touch screen it works the same way by dragging past a page's end: the bar follows the finger and holds while it's down, and a full pull is about a third of the screen's height (`touchReach`). Sideways swipes never pull.

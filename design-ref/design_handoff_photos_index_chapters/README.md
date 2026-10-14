# Handoff: Photos page — scroll-synced index (13a)

## Overview
This is a redesign of the site's **photos** page. The photos are grouped into categories (trips) and shown as one long scroll of chapters. A large index of the trip names stays fixed on the left. As the visitor scrolls, the trip they're in turns blue, slides in a little, and opens a short description under its name. Clicking a name smooth-scrolls to that chapter.

The page has **no "photos" header**. Remove the existing bottom-right page title on this page only.

## About the design files
The files in `prototype/` are **HTML design references**, not production code. They use a prototyping runtime (`support.js`, `*.dc.html`) that should not be shipped. Rebuild the page in the existing site code (vanilla JS + CSS, following the patterns of `src/ui/` and `src/styles/`).

To view the reference, open `prototype/Photos Index Chapters.dc.html` and look at board **13a**. 13b and 13c are rejected alternatives; ignore them.

## Fidelity
**High fidelity.** Layout, type, colors and motion are final. The trips, photo counts, photos and descriptions in the prototype are **placeholders**. Use the real photo data (see Data).

---

## Layout (desktop, at the reference size of 1280×720)
The whole viewport is the page, with a black (`#000`) background. It is a two-column grid: `grid-template-columns: 420px 1fr`.

### Left column: index (fixed, does not scroll)
- A vertical list of trip names, centered vertically in the viewport (`justify-content: center`), with an 8px gap between items. Padding: 64px on the left, 40px on the right.
- **Each item:**
  - Row (baseline-aligned, 12px gap): the trip name in Inter 400, 52px, line-height 1.1, letter-spacing .01em, then the photo count in 15px `#5a5a5a`.
  - Description below the name. It is collapsed by default and only the active item shows it: 15px, line-height 1.5, `#8f8f8f`, `text-wrap: pretty`, padding `8px 0 10px 14px`, so it lines up with the shifted active name.
- **Inactive item:** name `#ffffff`, item opacity .32, `translateX(0)`, description `max-height: 0; opacity: 0`.
- **Active item:** name `#6fb3e0` (the site's current-page blue), opacity 1, `translateX(14px)`, description `max-height: 120px; opacity: 1`.
- **Transitions:**
  - opacity .3s ease
  - transform .35s `cubic-bezier(.22,1,.36,1)`
  - name color .25s ease
  - description max-height .4s `cubic-bezier(.22,1,.36,1)` and opacity .3s ease
- The whole item is a button. Clicking it scrolls to that trip's chapter. Use a real `<button>` or `<a href="#trip-slug">`, keyboard-focusable, with `aria-current="true"` on the active one.

### Right column: chapters (the only thing that scrolls)
- Scroll container: `overflow-y: auto`, scrollbar hidden (`scrollbar-width: none` plus the `::-webkit-scrollbar` equivalent), right padding 40px.
- **Each chapter** (one per trip, in index order) is a column with a 16px gap and padding `40px 0 20px`, containing:
  1. **Divider** (every chapter except the first): 1px line in `#262626` spanning the column, margin `-20px 0 4px`. It sits halfway between the previous chapter's photos and this chapter's label.
  2. **Small label:** the chapter number (`01`, `02`…) and the trip name, 15px `#5a5a5a`, 10px gap.
  3. **Photo grid:** `grid-template-columns: repeat(3, 1fr)`, `grid-auto-rows: 170px`, `grid-auto-flow: dense`, 20px gap. Photos use `object-fit: cover` and `border-radius: 28px`.
- **Tile spans** (repeating pattern, by index within the chapter):
  `[2×2, 1×1, 1×1, 1×2, 2×1, 1×1, 1×1, 1×1, 1×1]` (columns × rows).
  It's fine to replace this with a rule based on aspect ratio: landscape → 2×1, portrait → 1×2, featured photo → 2×2.
- After the last chapter, add bottom padding of about 320px so the last trip can scroll up to the activation line and become active.

## Scroll sync (the core behavior)
- Measure each chapter's `offsetTop` relative to the scroll container, which must be `position: relative` or the offsetParent.
- The **activation line** is `scrollTop + 140px`. The active chapter is the last one whose top is at or above that line.
- If the container is scrolled to (or within the trailing pad of) the bottom, force the **last** chapter active.
- Update the index only when the active chapter changes. Run the check from a `scroll` listener throttled with `requestAnimationFrame`, or use an `IntersectionObserver` with `rootMargin: "-140px 0px -60% 0px"`. The result should match the line rule.
- **Click on an index item:** `container.scrollTo({ top: chapter.offsetTop - 20, behavior: 'smooth' })`. Let the scroll listener set the active state, so it updates as the scroll passes each chapter.
- Optional: update the URL hash (`#toronto`) when the active trip changes, using `history.replaceState`, and on load scroll to the trip named in the hash.

## Interaction with existing site features
- **Hover overlay:** keep the current photos-page hover (black gradient plus description) on each tile.
- **Carousel:** clicking a tile opens the existing carousel. Navigation should stay **within that trip**, looping. Esc or a backdrop click closes it. Pick the open style the site already uses.
- **Edge menu and seam:** these are unchanged. The left edge of the screen still opens the edge menu, so the index's 64px left padding must not block the 24px hot zone.
- **Scroll page transition (11a):** if it's implemented, the "end of page" for photos is the bottom of the **chapters container**, and the "top of page" is its top. Feed that container's scroll position to the pull logic instead of the window's.

## Responsive
- **900px and wider:** the layout above. Scale the left column to `clamp(300px, 33vw, 420px)` and the trip names to `clamp(36px, 4vw, 52px)`.
- **Under 900px:** stack the layout.
  - The index becomes a horizontal, sticky, scrollable row of names (20px) at the top. The active name is blue, and its description shows in a single line under the row.
  - Chapters go full width with a 2-column grid. Spans clamp to 2 columns.
- `prefers-reduced-motion: reduce`: no `translateX`, an instant scroll on click, and the description shown without the height animation.

## Data
Group the photos by trip. In the prototype the groups are guessed from filename prefixes in `public/photos/` (`toronto*`, `camp*`, `moab*`, `costarica*`, `poland*`). Prefer an explicit data file:
```js
// src/data/photo-trips.js
export default [
  { slug: 'toronto', name: 'toronto', description: '…', photos: ['toronto1', 'toronto2', …] },
  …
];
```
- Show the names in lowercase, matching the rest of the site.
- The count shown is `photos.length`.
- Descriptions are 1–2 sentences. Izzy will supply them; ship with empty strings and hide the description block when it's empty.
- Use the existing responsive image sources (`-800.webp`, `-1600.avif`, …) with `srcset`, plus `loading="lazy"` on everything except the first chapter.

## Design tokens
- Background `#000000`
- Active name `#6fb3e0`. Inactive name `#ffffff` at .32 opacity.
- Count and chapter label `#5a5a5a`. Description `#8f8f8f`. Divider `#262626`.
- Type: Inter (`--font`) 400. Sizes: 52px names, 15px meta and description.
- Photo radius 28px. Grid gap 20px. Row height 170px at 1280 wide; scale it with the column width so tiles stay roughly 4:3.
- Easing: `cubic-bezier(.22,1,.36,1)`

## Files
- `prototype/Photos Index Chapters.dc.html`: board 13a is the reference. Its logic is the `scrollA`, `measure` and `go` methods and the `listA` mapping in `renderVals()`.
- `prototype/edge/*.webp`: placeholder photos copied from `public/photos`.

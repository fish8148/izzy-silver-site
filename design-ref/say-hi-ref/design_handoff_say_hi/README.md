# Handoff: Say Hi page (Note layout, 20b)

## Overview
A redesign of the **say hi** (contact) page on Izzy Silver's portfolio. It is one screen. On the left is a contact form written as a sentence ("hi izzy, i'm ___ and you can reach me at ___"), with a message box and a send button under it. On the right is **Izzy's existing 3D model** with social links below it. After sending, the form is replaced by a thank-you message.

## About the Design Files
The files in `prototype/` are **design references made in HTML**. They show how the page should look and behave; they are not production code. Recreate the page in the site's existing codebase using its framework and patterns. Open `prototype/Say Hi.dc.html` in a browser to try it (keep `support.js` next to it).

## Fidelity
**High-fidelity.** Colors, type, spacing and interactions are final. The email address and social URLs are placeholders (see Assets).

## Layout
- Page background `#000`. The prototype frames the page at 1280×720. In production it fills the viewport: `min-height: 100vh`.
- Container: `display:grid; grid-template-columns: minmax(0,1fr) 340px; gap: 64px; padding: 72px 56px 56px`.
- **Left column**: `display:flex; flex-direction:column; justify-content:center; gap:28px`.
- **Right column**: `display:flex; flex-direction:column; gap:20px`, full height. The model area is `flex:1`, and the links row sits under it.

## Components

### Sentence form (left)
- Wrapper: `display:flex; flex-wrap:wrap; align-items:baseline; gap:14px`. Inter 400, 34px, line-height 1.5, `#ffffff`.
- Copy, verbatim, in order:
  1. text `hi izzy, i’m`
  2. input, placeholder `your name`, width 300px
  3. text `and you can reach me at`
  4. input, placeholder `your email`, width 420px (use `type="email"` in production)
- Inputs: transparent background, no border except `border-bottom: 1px solid #3a3a3a`, padding `0 0 4px`, no outline. Text 34px `#6fb3e0`; placeholder `#4a4a4a`.

### Message box
- Textarea, placeholder `what’s on your mind…`. Height 160px, no resize, background `#121212`, no border, `border-radius: 28px`, padding `24px 28px`, 20px/1.5 `#ffffff`, no outline. Placeholder `#4a4a4a`.

### Action row
- `display:flex; align-items:center; gap:28px`.
- **Send button** `send ↗`: 20px, padding `14px 28px`, pill radius (999px), `transition: background .2s ease`.
  - Disabled (message empty after trim): background `#1c1c1c`, text `#5a5a5a`, clicking does nothing.
  - Enabled: background `#6fb3e0`, text `#000`.
- Fallback line, 15px `#5a5a5a`: `or email ` + the address (`#6fb3e0`, clickable) + a status label `click to copy` / `copied`.

### Sent state (replaces the left column)
- Column, `justify-content:center; gap:20px`.
- `thanks, {name}`: 52px/1.1 `#6fb3e0`. If no name was entered, show just `thanks`.
- `i’ll get back to you soon.`: 34px/1.3 `#ffffff`.
- `write another`: 15px `#5a5a5a`, 12px extra top margin. Clicking it returns to the form, clears the message, and keeps the name and email.

### 3D model (right)
- **This replaces the photo.** Mount the site's existing 3D model of Izzy here (the same model/viewer the site already uses). The prototype has a placeholder element marked `data-model-mount="izzy"`.
- Box: fills the column above the links (about 340px wide × 560px tall at 720 height). `border-radius: 28px`, background `#0a0a0a`, `box-shadow: inset 0 0 0 1px #262626`. Transparent canvas, so the model sits on the dark panel.
- Keep whatever interaction the model already has elsewhere on the site (e.g. drag to rotate or idle motion). Don't add new behavior.
- While loading, show the empty panel. Do not show a spinner.

### Links row (under the model)
- `display:flex; gap:24px`, 15px. Items: `linkedin ↗`, `github ↗`, `instagram ↗`. Color `#8f8f8f`, hover `#6fb3e0`. Open in a new tab.

## Interactions & Behavior
- **Copy email:** clicking the address calls `navigator.clipboard.writeText(email)`. The label switches to `copied` for 1600ms, then goes back to `click to copy`. If you click again, the timer restarts.
- **Send:** enabled only when the message is non-empty (trimmed). Name and email are optional in the prototype. In production, validate the email format if it's filled in, and submit to whatever the site uses (a form service or a serverless endpoint). Show the sent state on success. On failure, keep the form and its contents, and show a 15px `#5a5a5a` line under the button: `couldn’t send, try emailing instead.`
- **Integration:** this page is one of the site's pages. It uses the existing edge menu, the seam indicator, and the page-to-page scroll transition from the other handoffs (`design_handoff_scroll_row_drop`, `design_handoff_scroll_page_transition`). Nothing new is needed here.

## State
- `name`, `from` (sender email), `msg`: strings.
- `sent`: boolean.
- `copied`: boolean, plus its timeout.
- (Production) `sending` / `error` for the submit request. Disable the button while `sending`.

## Design Tokens
- Colors: `#000000` page, `#0a0a0a` model panel, `#121212` textarea, `#1c1c1c` disabled button, `#262626` hairline, `#3a3a3a` input underline, `#4a4a4a` placeholder, `#5a5a5a` muted text, `#8f8f8f` secondary text, `#ffffff` primary text, `#6fb3e0` accent blue, `#a9d3ef` link hover.
- Type: Inter 400. Sizes 52 / 34 / 20 / 15 / 13px.
- Radius: 28px (panels), 999px (button).
- Spacing: 14, 20, 24, 28, 56, 64, 72px.

## Assets
- **3D model:** use the site's existing model of Izzy. It isn't included in this bundle.
- **Placeholders to replace:** email `hi@izzysilver.com`, and the URLs for linkedin, github and instagram (all `#` in the prototype).

## Files
- `prototype/Say Hi.dc.html`: the 20b layout on its own, interactive.
- `prototype/support.js`: runtime needed to open the prototype.

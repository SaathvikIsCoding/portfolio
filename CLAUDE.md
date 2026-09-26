# Portfolio — team workflow

Personal portfolio of a game designer. Static site (HTML/CSS/JS), deployed to GitHub Pages.

## Owner details
- GitHub: `SaathvikIsCoding/portfolio`, branch `main`, served by GitHub Pages from the repo root.
- Never invent personal facts — use visible `[placeholders]` for anything missing.

## How content works
- All text, links and image paths live in `content/content.json`. `js/main.js` fetches it and renders every section; empty sections (skills, projects, experience) hide themselves.
- The owner edits content through `/admin/` (`admin/admin.js`). It signs in with a fine-grained GitHub token (Contents: read/write on this repo only), stored only in the browser, and publishes each save as one commit via the GitHub Git Data API (images go to `assets/uploads/`, resized to WebP in the browser).
- Because the owner commits from the admin, **always `git pull --rebase` before editing or pushing** so their content changes aren't lost. Don't hand-edit `content/content.json` unless asked; if the JSON shape changes, update `normalize()`/`cleaned()` in `admin/admin.js` and `render()` in `js/main.js` together.
- Dark only, on a true-black background with neutral greys (no navy tints). There is no light theme or theme toggle — the owner removed it on purpose.
- Consistency rules (agreed with the owner):
  - Open, unboxed sections. Only project cards use the framed `.panel` (corner brackets). Blocks are separated with the dashed pixel rule (`--dash-rule`), not boxes or alternating section backgrounds.
  - Square corners everywhere (site, admin, resume toolbar). No border-radius.
  - Experience and Education use the same quest-log timeline entry (`logEntry()` in `main.js`): status tag + dates on top, UPPERCASE title, "Organisation, Location" below.
  - All item titles (h3) are uppercase. Detail lines use commas; the "·" separator is only for pixel labels (e.g. "LEVEL 01 · CHARACTER BIO").
  - Stats labels use the same words as the menu/headings (Experience, Projects, Skills, Certifications).
  - One hover effect for content items: the pixel "hop" (`--hop`, `--hop-timing`).
  - Calls to action (hero + contact) are 8-bit pixel buttons (`.pixel-btn`, built by `pixelButtons()`): pixel font, notched corners + bevel + ledge drawn with box-shadows, press down on click. First button is filled cyan (`.pixel-btn-primary`), the rest outlined. The owner rejected both flat offset-shadow buttons and a vertical title-screen menu. Secondary links are plain text links (e.g. the hero's "Find me on" row).
  - Header HUD pieces (LVL readout, Game on/off, menu button) are plain pixel text with no boxes (owner removed them), 44px tall. LVL is gold; the game switch is green when on and red when off.
  - Under every section heading is a world-map path (`levelBar()`/`placeLevelBar()` in `main.js`, owner's choice): numbered stops joined by a dotted path, one per section (home) or part (project page) — cleared stops cyan, the player ship parked on the current stop, upcoming stops hollow. It sits after the `<h2>`, not inside it, so heading text stays clean. It replaced a three-colour bar and then progress blocks; don't bring back decorative underlines.
  - Type scale: only use the `--fs-*` / `--ls-pixel` tokens in `:root` — no one-off font sizes. Pixel font = labels (`--fs-pixel`), badges/tags/dates/small buttons (`--fs-pixel-sm`), big buttons (`--fs-pixel-lg`), always `--ls-pixel` spacing. Display font = headings, titles (`--fs-title`), compact names (`--fs-title-sm`), menu. Body font = reading text (`--fs-read`), intros (`--fs-lead`), grey details (`--fs-meta`). Don't put ▶ or ↗ in pixel/display text (not in the fonts) — use the CSS `.pixel-arrow` / `.brand-mark` or plain ASCII `<` `>`.
  - Palette: black, cyan `#22d3ee`, pink `#f472b6`, gold `#facc15`. The favicon is the player ship in these colours. The admin uses the same palette; the resume paper stays white for ATS/print but its accent is dark cyan `#0e7490`.
- Visual theme is the arcade game-designer look: P1 character frame, arcade-scoreboard stats strip (pixel labels + pixel numbers between dashed rules — not boxed stat cards), LEVEL labels, inventory-style skills, quest cards, quest log, certificate cards (thumbnail of the actual certificate — the owner replaced the earlier trophy shelf). Projects and certifications show only their first row with a "See all (N)" pixel button (`firstRowOnly()` in `main.js`). The nav has no ▸ hover marker (owner removed it). The owner tried a toned-down RPG-window redesign and chose to go back to this one — don't redesign it unasked.
- `js/game.js` owns the game layer: starfield (`#bg-canvas`), companion pixel ship + crosshair cursor and click lasers (`#fx-canvas`, `.reticle`; mouse/fine pointers only), enemy ships that orbit and shoot at the player (desktop only, toggled by the `Game on/off` header button, stored in localStorage), score/hearts HUD drawn on the canvas, XP scroll bar + `LVL` HUD (reads `section[data-level]` set by `main.js`), achievements (sessionStorage) and the Konami easter egg. Everything must stay decorative (`pointer-events: none`, `aria-hidden`) and switch off under `prefers-reduced-motion`. Game labels decorate, but real headings/text stay plain so recruiters and parsers can read them.
- The header needs ~1140px for brand + 6 nav links + LVL + Game toggle + theme toggle, so the nav collapses to the hamburger below 1200px (CSS and the `matchMedia` in `main.js` must match).
- Detail pages: `project.html?id=…` and `certificate.html?id=…`, rendered by `js/detail.js` using helpers `main.js` exposes on `window.Portfolio` (`main.js` only renders the home page when `[data-slot="about"]` exists). Project cards (stretched "Open quest" link) and certificate cards (`.cert-card`) link to them.
  - Projects: `id, title, description (short summary), role, period, tech[], image (cover), live, repo, process, sections[], gallery[{src, caption}]`.
  - Project `sections[]` (page builder in the admin): `{type, heading, text, images?, html?, figma?}` with `type` one of `text`, `images-1`…`images-4`, `html`, `figma` (`SECTION_TYPES` in `admin/admin.js`, `imageCount()` in both files). Rendered in order as "Part 01…" after the process and before the gallery. HTML runs in a sandboxed `data:` iframe (own opaque origin, can't touch the site; reports its height via postMessage; must declare `color-scheme: dark`). Figma links become `https://www.figma.com/embed?embed_host=share&url=…`. `process` is plain text: blank line = paragraph, `## ` = sub-heading, `- ` = bullet (rendered as DOM, never innerHTML). Gallery opens in a `<dialog>` lightbox.
  - Certifications: `id, name, issuer, date, url (verify link), file, thumb` — `file` is an image or a PDF (PDF shown in an iframe + "Open PDF"). `thumb` is an optional preview image for PDFs. Cards and the page show thumb or the image file; otherwise the `certPaper()` paper-certificate stand-in (with a "PDF" tag for PDFs).
  - Ids: stored `id`, else slug of title/name, deduped with -2, -3. The same `slugify`/`withIds` logic lives in `js/main.js` and `admin/admin.js` — change both together. The admin keeps an existing id on rename so links don't break.
  - Admin uploads: images → WebP via `stageFile()`; PDFs (certificates only) kept as-is, max 10 MB. Everything uploaded goes to `assets/uploads/` in the same single commit as `content.json`.
- Visitor survey: `js/survey.js` (loaded on all public pages) opens a `<dialog>` once per visitor, 45 s into a visit (start time in sessionStorage so it counts across pages; localStorage `portfolio-survey` = sent/dismissed stops it forever). Fields: name + two dropdowns (reason for visiting, how they found the owner). Only runs when `content.survey` = `{enabled, url, key, greeting}` is set up in the admin's Survey tab.
  - Storage is Supabase (GitHub Pages can't store data). `supabase/survey.sql` creates `public.survey_responses` with an insert-only RLS policy for the public key, plus passphrase-protected `get_survey_responses` / `delete_survey_response` functions (passphrase in `private.survey_admin`, wrong passphrase → HTTP 403). The publishable key in content.json is public by design; the passphrase is only ever typed into the admin and kept in sessionStorage — never commit it.
  - Admin Survey tab: settings + responses table, counts by source/purpose, delete, CSV export (formula-injection safe). Admin CSP allows `https://*.supabase.co`.
- `resume.html` (+ `js/resume.js`, `css/resume.css`) renders an ATS-friendly resume from the same JSON: single column, standard headings, real text, system fonts, print-to-PDF ready. Keep it that way — no columns, tables, icons or text in images. It uses `profile.summary` (falls back to `about`).
- The owner's phone number is deliberately NOT in `content.json` (the repo is public). It's only added to the locally generated PDF.
- Local preview: `node tools/serve.mjs` (or the `portfolio` entry in `.claude/launch.json`) → http://localhost:5173 and http://localhost:5173/admin/.

## Team (`.claude/agents/`)
1. **ui-designer** → writes/updates `design/SPEC.md`
2. **frontend-dev** → builds the site from the spec
3. **qa-tester** → checks phone / tablet / desktop in the browser, reports PASS/FAIL
4. **deployer** → commits and pushes to GitHub, publishes on Pages

## Loop
For any request: design (if layout changes) → build → QA. If QA fails, send the issues back to frontend-dev and re-test (max 3 rounds). Deploy only after PASS. Make routine design and code decisions without asking the owner; ask only when real content is missing.

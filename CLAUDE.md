# Portfolio — team workflow

Personal developer portfolio. Static site (HTML/CSS/JS), deployed to GitHub Pages.

## Owner details
- GitHub: `SaathvikIsCoding/portfolio`, branch `main`, served by GitHub Pages from the repo root.
- Never invent personal facts — use visible `[placeholders]` for anything missing.

## How content works
- All text, links and image paths live in `content/content.json`. `js/main.js` fetches it and renders every section; empty sections (skills, projects, experience) hide themselves.
- The owner edits content through `/admin/` (`admin/admin.js`). It signs in with a fine-grained GitHub token (Contents: read/write on this repo only), stored only in the browser, and publishes each save as one commit via the GitHub Git Data API (images go to `assets/uploads/`, resized to WebP in the browser).
- Because the owner commits from the admin, **always `git pull --rebase` before editing or pushing** so their content changes aren't lost. Don't hand-edit `content/content.json` unless asked; if the JSON shape changes, update `normalize()`/`cleaned()` in `admin/admin.js` and `render()` in `js/main.js` together.
- Local preview: `node tools/serve.mjs` (or the `portfolio` entry in `.claude/launch.json`) → http://localhost:5173 and http://localhost:5173/admin/.

## Team (`.claude/agents/`)
1. **ui-designer** → writes/updates `design/SPEC.md`
2. **frontend-dev** → builds the site from the spec
3. **qa-tester** → checks phone / tablet / desktop in the browser, reports PASS/FAIL
4. **deployer** → commits and pushes to GitHub, publishes on Pages

## Loop
For any request: design (if layout changes) → build → QA. If QA fails, send the issues back to frontend-dev and re-test (max 3 rounds). Deploy only after PASS. Make routine design and code decisions without asking the owner; ask only when real content is missing.

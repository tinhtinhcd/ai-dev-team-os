# AI Dev Team OS

Local-first development workspace. Sprint 1 delivers the **Brain Panel** for viewing and editing project docs.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Open Brain Panel** or go to [http://localhost:3000/brain](http://localhost:3000/brain).

**Troubleshooting:**
- **"Failed to fetch"** — Restart the dev server, or open /brain directly in the address bar.
- **Page keeps loading** — Try `npm run dev:webpack` (Webpack instead of Turbopack), or open http://localhost:3000/brain directly.

## Brain Panel (/brain)

- **Left:** File list — PRODUCT.md, BACKLOG.md, DECISIONS.md, STACK.md
- **Center:** Markdown editor
- **Right:** Live markdown preview

### How to Test

1. Run `npm run dev`
2. Open http://localhost:3000/brain
3. Select a file (e.g. PRODUCT.md)
4. Edit the content in the center pane
5. Click **Save** — status shows "Saving…" then "Saved"
6. Verify on disk: `./brain/PRODUCT.md` (or the file you edited) reflects your changes

### Files

Brain docs live in `./brain/`:

- `PRODUCT.md` — Vision, goals, success metrics
- `BACKLOG.md` — To do, in progress, done
- `DECISIONS.md` — Architecture decision records
- `STACK.md` — Tech stack inventory

If the `brain` folder or any file is missing, they are created automatically on first load with starter templates.

## Handoff Workflow

`./handoff/` contains task and result templates:
- **TASK.md** — PM/Architect task brief
- **RESULT.md** — Engineer result summary

Workflow: Claude writes TASK.md → Cursor implements → writes RESULT.md → commit.

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS
- react-markdown
- Node `fs` for local read/write (no DB, no auth, no cloud)

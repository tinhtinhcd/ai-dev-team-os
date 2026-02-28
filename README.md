# AI Dev Team OS

A local-first development workspace for managing product vision, backlog, architecture decisions, and tech stack in one place. No database, no auth, no cloud — everything lives in your repo.

## Overview

- **Brain Panel** — View and edit project docs (PRODUCT.md, BACKLOG.md, DECISIONS.md, STACK.md) with a markdown editor and live preview
- **Handoff workflow** — Task and result templates for PM → Engineer collaboration
- **Local-first** — Uses Node `fs` for read/write; files live in `./brain/` and `./handoff/`

## Prerequisites

- **Node.js** 18.x or later
- **npm** 9+

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Open Brain Panel**, or go directly to [http://localhost:3000/brain](http://localhost:3000/brain).

### Troubleshooting

- **"Failed to fetch"** — Restart the dev server, or open `/brain` directly in the address bar.
- **Page keeps loading** — Try `npm run dev:webpack` (Webpack instead of Turbopack), or open http://localhost:3000/brain directly.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run dev:webpack` | Start dev server (Webpack) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Brain Panel (`/brain`)

- **Left:** File list — PRODUCT.md, BACKLOG.md, DECISIONS.md, STACK.md
- **Center:** Markdown editor
- **Right:** Live markdown preview

### Brain Files

Docs live in `./brain/`:

| File | Purpose |
|------|---------|
| `PRODUCT.md` | Vision, goals, success metrics |
| `BACKLOG.md` | To do, in progress, done |
| `DECISIONS.md` | Architecture decision records |
| `STACK.md` | Tech stack inventory |

If the `brain` folder or any file is missing, they are created automatically on first load with starter templates.

### How to Test

1. Run `npm run dev`
2. Open http://localhost:3000/brain
3. Select a file (e.g. PRODUCT.md)
4. Edit the content in the center pane
5. Click **Save** — status shows "Saving…" then "Saved"
6. Verify on disk: `./brain/PRODUCT.md` (or the file you edited) reflects your changes

## Handoff Workflow

`./handoff/` contains task and result templates:

- **TASK.md** — PM/Architect task brief
- **RESULT.md** — Engineer result summary

Workflow: PM writes TASK.md → Engineer implements → writes RESULT.md → commit.

## Tech Stack

- **Next.js** 16 (App Router)
- **React** 19
- **Tailwind CSS** 4
- **react-markdown** — Markdown rendering
- **Node `fs`** — Local file read/write (no DB, no auth, no cloud)

## Project Structure

```
├── brain/           # Project docs (PRODUCT, BACKLOG, DECISIONS, STACK)
├── handoff/         # Task and result templates
├── src/
│   ├── app/         # Next.js App Router pages
│   │   ├── brain/   # Brain Panel page and actions
│   │   └── ...
│   └── lib/         # Utilities (brain.ts, observability)
└── public/          # Static assets
```

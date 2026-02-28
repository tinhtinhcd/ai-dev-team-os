# Archived Legacy Code

This folder contains code moved during the TIN-12 cleanup to prepare for the new gateway + integrations + storage architecture.

## What Was Archived (2025-02-28)

### 1. Brain Panel (`src/app/brain/`)
- **Purpose:** Local-first markdown editor for project docs (PRODUCT.md, BACKLOG.md, DECISIONS.md, STACK.md, TEAMS.md, LINEAR_FAMILIARIZATION.md)
- **Why archived:** Legacy UI; new system will use Linear as single source of truth, Slack as reporting hub
- **Files:** `page.tsx`, `loading.tsx`, `actions.ts`

### 2. Integrations Page (`src/app/integrations/`)
- **Purpose:** Marketing-style page linking to external Linear integration docs
- **Why archived:** Static links to Linear.app; new system will have real gateway-driven integrations
- **Files:** `page.tsx`

### 3. Brain Library (`src/lib/brain.ts`)
- **Purpose:** File I/O for brain markdown docs (read/write to `./brain/`)
- **Why archived:** Supports Brain Panel; new architecture uses event-driven storage

### 4. Linear Import Library (`src/lib/linear.ts`)
- **Purpose:** Fetch Linear issues via GraphQL for backlog import
- **Why archived:** One-way import; new system will have bidirectional Linear integration via gateway

### 5. Observability (`src/lib/observability/usage.ts`)
- **Purpose:** AI call log parsing, usage aggregation, cost estimation
- **Why archived:** Not wired to any UI; will be reimplemented as part of gateway metrics

### 6. Brain Docs (`brain/`)
- **Purpose:** Project docs (PRODUCT.md, BACKLOG.md, DECISIONS.md, STACK.md, TEAMS.md, LINEAR_FAMILIARIZATION.md)
- **Why archived:** Kept for reference; new system uses Linear for backlog

### 7. Handoff Workflow (`handoff/`)
- **Purpose:** TASK.md / RESULT.md templates for PM → Engineer collaboration
- **Why archived:** Workflow will be redefined around Linear + Slack + Cursor

## Restoring Archived Code

To restore any archived module, copy it back to the corresponding path under `src/` or project root. Update imports and remove any references to archived modules from the new codebase.

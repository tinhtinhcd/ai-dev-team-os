# Open Issues — Task Breakdown (Assigned to Codex)

> **Purpose:** Break down all currently open Linear issues into actionable execution tasks and assign them to **Codex**.
>
> **Environment:** Use the **AI-Comic-Studio** environment until instructed otherwise.
>
> **Refresh:** Run `npm run sync:open-tickets` with `LINEAR_API_KEY` set to sync the latest open issues from Linear.

---

## Open Issues Summary

| Issue   | Title                                           | Status    | Assignee |
|---------|--------------------------------------------------|-----------|----------|
| TIN-30  | Update all docs based on open tickets            | In Progress | Codex  |
| TIN-38  | Create tasks from open issues and assign to Codex | To Do    | Codex    |

---

## TIN-30 — Update all docs based on open tickets

**Assignee:** Codex  
**Environment:** AI-Comic-Studio

### Task 1: Audit open tickets and doc mapping
- [ ] Run `npm run sync:open-tickets` to get latest open issues
- [ ] Map each open ticket to relevant docs (e.g. README, docs/, archive/)
- [ ] Document findings in a short checklist

### Task 2: Update docs based on ticket content
- [ ] For each open ticket, identify required doc changes
- [ ] Update README.md, docs/*.md, and other docs as needed
- [ ] Ensure cross-references and links are correct

### Task 3: Consistency and validation
- [ ] Ensure doc format and style are consistent
- [ ] Verify no broken links or outdated references
- [ ] Mark complete in Linear when done

---

## TIN-38 — Create tasks from open issues and assign to Codex

**Assignee:** Codex  
**Environment:** AI-Comic-Studio

### Task 1: Create task breakdown document
- [x] Create `docs/OPEN_ISSUES_TASK_BREAKDOWN.md`
- [x] List all open issues from Linear (or OPEN_TICKETS.md)
- [x] Break each issue into actionable tasks
- [x] Assign each task explicitly to Codex

### Task 2: Assign open issues to Codex in Linear
- [ ] Run `npm run assign:open-issues-to-codex` with `LINEAR_API_KEY` and `LINEAR_CODEX_USER_ID` set
- [ ] Verify assignments in Linear
- [ ] Mark complete in Linear when done

### Task 3: Operating notes (done)
- [x] Document AI-Comic-Studio environment requirement
- [x] Add refresh instructions for future sync

---

## Operating Notes

- **Environment:** Work in the **AI-Comic-Studio** environment unless instructed to change.
- **Assignee:** All tasks are assigned to **Codex**.
- **Sync:** Refresh open issues with `npm run sync:open-tickets` before updating this document.
- **Linear:** Linear is the single source of truth. Use `docs/OPEN_TICKETS.md` for sync output.

---

*Last updated: 2025-03-06*

---

## Assigning via Script

To assign open issues to Codex in Linear:

```bash
LINEAR_API_KEY=lin_api_xxx LINEAR_CODEX_USER_ID=<codex-user-uuid> npm run assign:open-issues-to-codex
```

Find Codex user ID: Linear app → Cmd+K (Command menu) → search "Codex" → Copy model UUID.

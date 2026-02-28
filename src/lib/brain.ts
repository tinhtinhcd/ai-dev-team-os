import fs from "fs";
import path from "path";

const BRAIN_DIR = "brain";
const BRAIN_FILES = [
  "PRODUCT.md",
  "BACKLOG.md",
  "DECISIONS.md",
  "STACK.md",
  "TEAMS.md",
  "LINEAR_FAMILIARIZATION.md",
] as const;
export type BrainFile = (typeof BRAIN_FILES)[number];

const TEMPLATES: Record<BrainFile, string> = {
  "PRODUCT.md": `# Product

## Vision
_What are we building?_

## Goals
- 
- 
- 

## Success Metrics
- 
`,

  "BACKLOG.md": `# Backlog

## To Do
- [ ] 
- [ ] 
- [ ] 

## In Progress
- [ ] 

## Done
- [x] 
`,

  "DECISIONS.md": `# Architecture Decision Records

## ADR-001: _Title_
**Status:** Proposed | Accepted | Deprecated
**Date:** YYYY-MM-DD

### Context
_What is the issue?_

### Decision
_What did we decide?_

### Consequences
_What are the trade-offs?_
`,

  "STACK.md": `# Tech Stack

## Core
- **Runtime:** 
- **Framework:** 
- **Language:** 

## Data
- **Database:** 
- **Cache:** 

## DevOps
- **Hosting:** 
- **CI/CD:** 
`,

  "TEAMS.md": `# Teams

Teams organize people and work in this workspace. Define your team structure, roles, and how to invite members.

## Team Structure
_List your teams and what they own._

| Team | Purpose | Members |
|------|---------|---------|
|      |         |         |

## Roles
- **Admin** — Full access to settings and workflows
- **Member** — Can contribute to work and collaborate
- **Guest** — Limited access, view-only or specific scope

## Inviting Members
- **CSV import** — Bulk add members from a spreadsheet
- **Invite link** — Share a unique link for self-service signup

_Configure invites in your [settings](http://linear.app/settings/members)._
`,
  "LINEAR_FAMILIARIZATION.md": `# Linear Platform Familiarization

## Overview
Linear is a modern project management and issue-tracking platform for software teams.

## Key Concepts
- **Teams** — Organize work by team
- **Issues** — Track tasks with IDs, statuses, and titles
- **Cycles** — Time-boxed sprints
- **Projects** — Grouped initiatives

## Resources
- [Linear docs](https://linear.app/docs)
- [Join Slack](https://linear.app/join-slack)
- Press \`?\` in Linear for help
`,
};

function getBrainDir(): string {
  return path.join(process.cwd(), BRAIN_DIR);
}

function getFilePath(filename: BrainFile): string {
  return path.join(getBrainDir(), filename);
}

export function ensureBrainExists(): void {
  const dir = getBrainDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  for (const file of BRAIN_FILES) {
    const filePath = getFilePath(file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, TEMPLATES[file], "utf-8");
    }
  }
}

export function readBrainFile(filename: BrainFile): string {
  ensureBrainExists();
  const filePath = getFilePath(filename);
  return fs.readFileSync(filePath, "utf-8");
}

export function writeBrainFile(filename: BrainFile, content: string): void {
  ensureBrainExists();
  const filePath = getFilePath(filename);
  fs.writeFileSync(filePath, content, "utf-8");
}

export function getBrainFiles(): BrainFile[] {
  return [...BRAIN_FILES];
}

"use server";

import { readBrainFile, writeBrainFile, type BrainFile } from "@/lib/brain";
import {
  fetchLinearIssues,
  type LinearImportIssue,
} from "@/lib/linear";

export async function loadBrainFile(filename: BrainFile): Promise<string> {
  return readBrainFile(filename);
}

export async function saveBrainFile(
  filename: BrainFile,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    writeBrainFile(filename, content);
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: message };
  }
}

function formatBacklogItem(issue: LinearImportIssue, checked: boolean): string {
  const checkbox = checked ? "[x]" : "[ ]";
  const link = issue.url ? ` (${issue.url})` : "";
  const label = issue.title ? `${issue.identifier}: ${issue.title}` : issue.identifier;
  return `- ${checkbox} ${label}${link}`;
}

function issuesToBacklogMarkdown(issues: LinearImportIssue[]): string {
  const todo = issues.filter((i) => i.status === "todo");
  const inProgress = issues.filter((i) => i.status === "in_progress");
  const done = issues.filter((i) => i.status === "done");

  const sections: string[] = [
    "# Backlog",
    "",
    "## To Do",
    ...(todo.length ? todo.map((i) => formatBacklogItem(i, false)) : ["- [ ] "]),
    "",
    "## In Progress",
    ...(inProgress.length
      ? inProgress.map((i) => formatBacklogItem(i, false))
      : ["- [ ] "]),
    "",
    "## Done",
    ...(done.length ? done.map((i) => formatBacklogItem(i, true)) : ["- [x] "]),
  ];

  return sections.join("\n");
}

export async function importFromLinear(
  apiKey: string,
  mergeWithExisting: boolean
): Promise<{
  success: boolean;
  error?: string;
  importedCount?: number;
}> {
  const { issues, error } = await fetchLinearIssues(apiKey);
  if (error) return { success: false, error };

  if (!mergeWithExisting) {
    const newContent = issuesToBacklogMarkdown(issues);
    writeBrainFile("BACKLOG.md", newContent);
    return { success: true, importedCount: issues.length };
  }

  const existing = readBrainFile("BACKLOG.md");
  const existingItems = existing
    .split("\n")
    .filter((line) => line.trim().startsWith("- ["));
  const linearIds = new Set(issues.map((i) => i.identifier));
  const LINEAR_ID_REGEX = /^-\s*\[[ x]\]\s+([A-Z]+-\d+):/;
  const existingOnly = existingItems.filter((line) => {
    const m = line.match(LINEAR_ID_REGEX);
    return !m || !linearIds.has(m[1]);
  });

  const existingAsIssues: LinearImportIssue[] = existingOnly.map((line) => {
    const checked = line.includes("[x]");
    const m = line.match(/^-\s*\[[ x]\]\s+(.+)$/);
    return {
      identifier: m?.[1] ?? line,
      title: "",
      description: null,
      status: (checked ? "done" : "todo") as LinearImportIssue["status"],
      url: undefined,
    };
  });

  const merged = [...issues, ...existingAsIssues];
  const mergedContent = issuesToBacklogMarkdown(merged);
  writeBrainFile("BACKLOG.md", mergedContent);

  const existingIds = new Set(
    existingItems.map((l) => l.match(LINEAR_ID_REGEX)?.[1]).filter(Boolean)
  );
  const newCount = issues.filter((i) => !existingIds.has(i.identifier)).length;
  return { success: true, importedCount: newCount || issues.length };
}

export async function fetchLinearIssuesForPreview(
  apiKey: string
): Promise<{
  success: boolean;
  issues?: LinearImportIssue[];
  error?: string;
}> {
  const { issues, error } = await fetchLinearIssues(apiKey);
  if (error) return { success: false, error };
  return { success: true, issues };
}

#!/usr/bin/env node
/**
 * Process .md files in open-task/ → create Linear issues, move to open-task-processed/
 *
 * Run: LINEAR_API_KEY=... LINEAR_TEAM_ID=... node scripts/process-open-task.js
 * Dry-run (no API, no file moves): node scripts/process-open-task.js --dry-run
 *
 * - Chỉ xử lý file .md trong open-task/
 * - Parse title (dòng đầu hoặc # đầu tiên) + description
 * - Trước khi tạo: search Linear xem đã có issue cùng title chưa (idempotency)
 * - Sau khi tạo: di chuyển file sang open-task-processed/
 * - Retry-safe: không tạo trùng khi chạy lại
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node script */

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

const OPEN_TASK_DIR = path.join(process.cwd(), "open-task");
const PROCESSED_DIR = path.join(process.cwd(), "open-task-processed");

const LINEAR_API = "https://api.linear.app/graphql";

function authHeader(apiKey) {
  return apiKey.startsWith("lin_api_") ? apiKey : `Bearer ${apiKey}`;
}

async function linearRequest(apiKey, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(apiKey),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "Linear API error");
  }
  return json.data;
}

const SEARCH_ISSUES_QUERY = `
  query SearchIssues($filter: IssueFilter, $first: Int!) {
    issues(filter: $filter, first: $first) {
      nodes {
        id
        identifier
        title
      }
    }
  }
`;

async function findExistingIssue(apiKey, teamId, title) {
  const data = await linearRequest(apiKey, SEARCH_ISSUES_QUERY, {
    filter: {
      title: { eq: title },
      team: { id: { eq: teamId } },
      archivedAt: { null: true },
    },
    first: 5,
  });
  const nodes = data?.issues?.nodes ?? [];
  return nodes[0] ?? null;
}

const CREATE_ISSUE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        title
        url
      }
    }
  }
`;

async function createIssue(apiKey, teamId, title, description) {
  const data = await linearRequest(apiKey, CREATE_ISSUE_MUTATION, {
    input: {
      teamId,
      title,
      description: description || undefined,
    },
  });
  const create = data?.issueCreate;
  if (!create?.success || !create.issue) {
    throw new Error("Issue creation failed");
  }
  return create.issue;
}

/**
 * Parse .md: title từ dòng đầu (# Title hoặc plain), body = phần còn lại
 */
function parseMarkdown(content, filename) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return { title: filename.replace(/\.md$/i, ""), description: "" };
  }

  let title = lines[0].trim();
  if (title.startsWith("# ")) {
    title = title.slice(2).trim();
  }

  const body = lines.slice(1).join("\n").trim();
  const description = body
    ? `*Source: open-task/${filename}*\n\n---\n\n${body}`
    : `*Source: open-task/${filename}*`;

  return { title: title || filename.replace(/\.md$/i, ""), description };
}

function getMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => path.join(dir, f));
}

async function main() {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;

  if (!DRY_RUN) {
    if (!apiKey) {
      console.error("LINEAR_API_KEY is required.");
      process.exit(1);
    }
    if (!teamId) {
      console.error("LINEAR_TEAM_ID is required.");
      process.exit(1);
    }
  }

  const files = getMdFiles(OPEN_TASK_DIR);
  if (files.length === 0) {
    console.log("No .md files to process in open-task/");
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would process ${files.length} file(s):`);
  }

  if (!DRY_RUN) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const { title, description } = parseMarkdown(content, filename);

    if (DRY_RUN) {
      console.log(`  - ${filename} → title: "${title}" (${description.length} chars)`);
      continue;
    }

    let issueId;
    const existing = await findExistingIssue(apiKey, teamId, title);
    if (existing) {
      issueId = existing.identifier;
      console.log(`[SKIP] Issue exists: ${issueId} — ${title}`);
    } else {
      const issue = await createIssue(apiKey, teamId, title, description);
      issueId = issue.identifier;
      console.log(`[CREATED] ${issueId} — ${title} — ${issue.url}`);
    }

    const destPath = path.join(PROCESSED_DIR, filename);
    fs.renameSync(filePath, destPath);
    console.log(`[MOVED] ${filename} → open-task-processed/`);
  }

  if (DRY_RUN) {
    console.log("[DRY-RUN] No files were moved or issues created.");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

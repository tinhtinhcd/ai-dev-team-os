#!/usr/bin/env node
/**
 * Assign all open (non-done) Linear issues to Codex.
 * Run: LINEAR_API_KEY=... LINEAR_CODEX_USER_ID=... [LINEAR_TEAM_ID=...] node scripts/assign-open-issues-to-codex.js
 *
 * Requires: LINEAR_API_KEY, LINEAR_CODEX_USER_ID
 * Optional: LINEAR_TEAM_ID (filter to specific team)
 *
 * To find Codex user ID: Linear app → Command menu (Cmd+K) → search "Codex" → Copy model UUID
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node script */

const LINEAR_API = "https://api.linear.app/graphql";
const DONE_TYPES = ["completed", "canceled"];

const teamFilter = process.env.LINEAR_TEAM_ID
  ? ", team: { id: { eq: $teamId } }"
  : "";

const ISSUES_QUERY = `
  query ImportIssues($first: Int!, $after: String, $teamId: ID) {
    issues(first: $first, after: $after, filter: {
      archivedAt: { null: true }${teamFilter}
    }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        identifier
        title
        assignee { id name }
        state { type }
      }
    }
  }
`;

const UPDATE_ISSUE_MUTATION = `
  mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id identifier title assignee { name } }
    }
  }
`;

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
    body: JSON.stringify({ query: query.replace(/\s+/g, " ").trim(), variables }),
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

async function fetchOpenIssues(apiKey, teamId) {
  const issues = [];
  let after = null;

  do {
    const variables = { first: 250, after };
    if (teamId) variables.teamId = teamId;

    const data = await linearRequest(apiKey, ISSUES_QUERY, variables);
    const nodes = data?.issues?.nodes ?? [];
    const pageInfo = data?.issues?.pageInfo;

    for (const node of nodes) {
      const stateType = node.state?.type ?? "unstarted";
      if (!DONE_TYPES.includes(stateType)) {
        issues.push(node);
      }
    }

    after = pageInfo?.hasNextPage ? pageInfo.endCursor ?? null : null;
  } while (after);

  return issues;
}

async function assignIssueToCodex(apiKey, issueId, codexUserId) {
  const data = await linearRequest(apiKey, UPDATE_ISSUE_MUTATION, {
    id: issueId,
    input: { assigneeId: codexUserId },
  });
  return data?.issueUpdate;
}

async function main() {
  const apiKey = process.env.LINEAR_API_KEY;
  const codexUserId = process.env.LINEAR_CODEX_USER_ID;
  const teamId = process.env.LINEAR_TEAM_ID;

  if (!apiKey) {
    console.error("LINEAR_API_KEY is required.");
    process.exit(1);
  }
  if (!codexUserId) {
    console.error("LINEAR_CODEX_USER_ID is required. Find Codex user ID in Linear (Cmd+K → Codex → Copy model UUID).");
    process.exit(1);
  }

  console.log("Fetching open issues...");
  const issues = await fetchOpenIssues(apiKey, teamId);
  console.log(`Found ${issues.length} open issue(s).`);

  if (issues.length === 0) {
    console.log("Nothing to assign.");
    return;
  }

  for (const issue of issues) {
    const alreadyAssigned = issue.assignee?.id === codexUserId;
    if (alreadyAssigned) {
      console.log(`[SKIP] ${issue.identifier} — ${issue.title} (already assigned to Codex)`);
      continue;
    }

    const result = await assignIssueToCodex(apiKey, issue.id, codexUserId);
    if (result?.success) {
      console.log(`[ASSIGNED] ${issue.identifier} — ${issue.title} → Codex`);
    } else {
      console.error(`[FAIL] ${issue.identifier} — ${issue.title}`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

export type LinearIssueStatus = "todo" | "in_progress" | "done";

export interface LinearImportIssue {
  identifier: string;
  title: string;
  description?: string | null;
  status: LinearIssueStatus;
  url?: string;
}

const TODO_TYPES = ["triage", "backlog", "unstarted"];
const IN_PROGRESS_TYPES = ["started"];
const DONE_TYPES = ["completed", "canceled"];

function mapStateTypeToStatus(stateType: string): LinearIssueStatus {
  if (TODO_TYPES.includes(stateType)) return "todo";
  if (IN_PROGRESS_TYPES.includes(stateType)) return "in_progress";
  if (DONE_TYPES.includes(stateType)) return "done";
  return "todo";
}

const ISSUES_QUERY = `
  query ImportIssues($first: Int!, $after: String) {
    issues(first: $first, after: $after, filter: { archivedAt: { null: true } }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        identifier
        title
        description
        url
        state { type }
      }
    }
  }
`;

export async function fetchLinearIssues(
  apiKey: string
): Promise<{ issues: LinearImportIssue[]; error?: string }> {
  try {
    const issues: LinearImportIssue[] = [];
    let after: string | null = null;

    do {
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey.startsWith("lin_api_") ? apiKey : `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: ISSUES_QUERY,
          variables: { first: 250, after },
        }),
      });

      if (!res.ok) {
        return { issues: [], error: `Linear API error: ${res.status}` };
      }

      const json = (await res.json()) as {
        data?: { issues?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: Array<{ identifier: string; title: string; description?: string | null; url?: string; state?: { type: string } }> } };
        errors?: Array<{ message: string }>;
      };

      if (json.errors?.length) {
        return { issues: [], error: json.errors[0]?.message ?? "Linear API error" };
      }

      const nodes = json.data?.issues?.nodes ?? [];
      const pageInfo = json.data?.issues?.pageInfo;

      for (const node of nodes) {
        const stateType = node.state?.type ?? "unstarted";
        issues.push({
          identifier: node.identifier,
          title: node.title,
          description: node.description,
          status: mapStateTypeToStatus(stateType),
          url: node.url,
        });
      }

      after = pageInfo?.hasNextPage ? pageInfo.endCursor ?? null : null;
    } while (after);

    return { issues };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { issues: [], error: message };
  }
}

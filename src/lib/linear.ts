/**
 * Linear API helpers for Van Bot (Slack → Linear issue creation).
 */

const ISSUE_CREATE_MUTATION = `
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

export interface CreateLinearIssueInput {
  teamId: string;
  title: string;
  description?: string;
  assigneeId?: string;
}

export interface CreateLinearIssueResult {
  success: boolean;
  identifier?: string;
  url?: string;
  error?: string;
}

export async function createLinearIssue(
  apiKey: string,
  input: CreateLinearIssueInput
): Promise<CreateLinearIssueResult> {
  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey.startsWith("lin_api_") ? apiKey : `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: ISSUE_CREATE_MUTATION,
        variables: {
          input: {
            teamId: input.teamId,
            title: input.title,
            description: input.description ?? undefined,
            assigneeId: input.assigneeId ?? undefined,
          },
        },
      }),
    });

    if (!res.ok) {
      return { success: false, error: `Linear API error: ${res.status}` };
    }

    const json = (await res.json()) as {
      data?: { issueCreate?: { success?: boolean; issue?: { identifier?: string; url?: string } } };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      return { success: false, error: json.errors[0]?.message ?? "Linear API error" };
    }

    const create = json.data?.issueCreate;
    if (!create?.success || !create.issue) {
      return { success: false, error: "Issue creation failed" };
    }

    return {
      success: true,
      identifier: create.issue.identifier,
      url: create.issue.url,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: message };
  }
}

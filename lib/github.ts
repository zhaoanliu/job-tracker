const GITHUB_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
}

export function getGitHubCreds(): { repo: string; pat: string } | null {
  const repo = process.env.GITHUB_REPO
  const pat = process.env.GH_PAT
  if (!repo || !pat) {
    console.error('Missing GITHUB_REPO or GH_PAT env vars')
    return null
  }
  return { repo, pat }
}

export async function dispatchGitHubEvent(
  repo: string,
  pat: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${pat}` },
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  })
}

export async function createGitHubIssue(
  repo: string,
  pat: string,
  title: string,
  body: string,
  labels: string[]
): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${pat}` },
    body: JSON.stringify({ title, body, labels }),
  })
}

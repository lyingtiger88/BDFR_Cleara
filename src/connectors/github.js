const API = 'https://api.github.com';

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'BDFR-Cleara/0.1'
  };
}

async function request(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(token), ...(options.headers || {}) }
  });

  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

  if (!response.ok) {
    const error = new Error(data?.message || `GitHub request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function validateGitHubToken(token) {
  const user = await request('/user', token);
  return { login: user.login, avatarUrl: user.avatar_url, name: user.name };
}

export async function listGists(token, maxPages = 5) {
  const results = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await request(`/gists?per_page=100&page=${page}`, token);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data.map((gist) => ({
      id: gist.id,
      type: 'gist',
      title: gist.description || Object.keys(gist.files || {})[0] || '(untitled gist)',
      body: Object.keys(gist.files || {}).join(', '),
      url: gist.html_url,
      createdAt: gist.created_at,
      updatedAt: gist.updated_at,
      public: gist.public
    })));
    if (data.length < 100) break;
  }
  return results;
}

export async function deleteGist(token, gistId) {
  await request(`/gists/${encodeURIComponent(gistId)}`, token, { method: 'DELETE' });
  return { id: gistId, deleted: true };
}

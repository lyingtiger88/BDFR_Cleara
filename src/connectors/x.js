import crypto from 'node:crypto';

export const X_API_BASE = 'https://api.x.com/2';
export const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
export const X_TOKEN_URL = `${X_API_BASE}/oauth2/token`;
export const X_SCOPES = ['tweet.read','tweet.write','users.read','offline.access'];

const base64url = (buffer) => Buffer.from(buffer).toString('base64url');

export function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function createOAuthState() { return base64url(crypto.randomBytes(32)); }

export function buildAuthorizeUrl({ clientId, redirectUri, state, challenge, scopes = X_SCOPES }) {
  if (!clientId || !redirectUri || !state || !challenge) throw new Error('clientId, redirectUri, state and challenge are required.');
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id',clientId);
  url.searchParams.set('redirect_uri',redirectUri);
  url.searchParams.set('scope',scopes.join(' '));
  url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',challenge);
  url.searchParams.set('code_challenge_method','S256');
  return url.toString();
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text ? { detail:text } : null; }
  if (!response.ok) {
    const message = data?.detail || data?.title || data?.error_description || data?.error || `X API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error;
    const reset = Number(response.headers?.get?.('x-rate-limit-reset'));
    if (Number.isFinite(reset) && reset > 0) error.rateLimitReset = reset;
    error.data = data;
    throw error;
  }
  return data;
}

async function tokenRequest(params, { fetchImpl = fetch, clientSecret } = {}) {
  const headers = { 'Content-Type':'application/x-www-form-urlencoded' };
  const body = new URLSearchParams(params);
  if (clientSecret) {
    const clientId = body.get('client_id');
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    body.delete('client_id');
  }
  const response = await fetchImpl(X_TOKEN_URL, { method:'POST', headers, body });
  return parseResponse(response);
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri, verifier }, options = {}) {
  if (!clientId || !code || !redirectUri || !verifier) throw new Error('Missing OAuth token exchange parameters.');
  return tokenRequest({ code, grant_type:'authorization_code', client_id:clientId, redirect_uri:redirectUri, code_verifier:verifier }, { ...options, clientSecret });
}

export async function refreshAccessToken({ clientId, clientSecret, refreshToken }, options = {}) {
  if (!clientId || !refreshToken) throw new Error('clientId and refreshToken are required.');
  return tokenRequest({ refresh_token:refreshToken, grant_type:'refresh_token', client_id:clientId }, { ...options, clientSecret });
}

async function apiRequest(path, accessToken, options = {}, { fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error('X access token is required.');
  const response = await fetchImpl(`${X_API_BASE}${path}`, {
    ...options,
    headers:{ Authorization:`Bearer ${accessToken}`, Accept:'application/json', ...(options.headers||{}) }
  });
  return parseResponse(response);
}

export async function getAuthenticatedUser(accessToken, options = {}) {
  const result = await apiRequest('/users/me?user.fields=id,name,username,profile_image_url', accessToken, {}, options);
  const user = result?.data;
  if (!user?.id) throw new Error('X did not return an authenticated user.');
  return { id:user.id, username:user.username, name:user.name, profileImageUrl:user.profile_image_url };
}

function mapPost(post) {
  return {
    id:post.id,
    type:'post',
    title:(post.text || '').slice(0,90) || '(empty post)',
    body:post.text || '',
    url:`https://x.com/i/web/status/${post.id}`,
    createdAt:post.created_at || null,
    conversationId:post.conversation_id || null,
    metrics:post.public_metrics || null
  };
}

export async function listOwnPostsPage(
  accessToken,
  userId,
  { maxResults = 100, exclude = [], paginationToken = null } = {},
  options = {}
) {
  if (!userId) throw new Error('X userId is required.');
  const params = new URLSearchParams({
    max_results:String(Math.max(5, Math.min(100, maxResults))),
    'tweet.fields':'id,text,created_at,conversation_id,public_metrics'
  });
  if (exclude.length) params.set('exclude', exclude.join(','));
  if (paginationToken) params.set('pagination_token', paginationToken);

  const result = await apiRequest(
    `/users/${encodeURIComponent(userId)}/tweets?${params}`,
    accessToken,
    {},
    options
  );
  const data = Array.isArray(result?.data) ? result.data : [];
  return {
    items:data.map(mapPost),
    nextToken:result?.meta?.next_token || null,
    resultCount:Number(result?.meta?.result_count ?? data.length)
  };
}

export async function listOwnPosts(accessToken, userId, { maxPages = 10, maxResults = 100, exclude = [] } = {}, options = {}) {
  const items = [];
  let paginationToken = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listOwnPostsPage(
      accessToken,
      userId,
      { maxResults, exclude, paginationToken },
      options
    );
    items.push(...result.items);
    paginationToken = result.nextToken;
    if (!paginationToken || result.items.length === 0) break;
  }
  return items;
}

export async function deletePost(accessToken, postId, options = {}) {
  if (!postId) throw new Error('postId is required.');
  const result = await apiRequest(`/tweets/${encodeURIComponent(postId)}`, accessToken, { method:'DELETE' }, options);
  return { id:postId, deleted:result?.data?.deleted === true };
}

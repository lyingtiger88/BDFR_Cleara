import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectors } from './src/connectors/catalog.js';
import { validateGitHubToken, listGists, deleteGist } from './src/connectors/github.js';
import { buildAuthorizeUrl, createOAuthState, createPkcePair, deletePost, exchangeCode, getAuthenticatedUser, listOwnPosts, listOwnPostsPage, refreshAccessToken } from './src/connectors/x.js';
import { filterItems } from './src/core/filter-engine.js';

const ROOT=fileURLToPath(new URL('.',import.meta.url));
const PUBLIC=join(ROOT,'public');
const PORT=Number(process.env.PORT||4177);
const MAX_BODY=1024*1024;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const xPending=new Map();
const xSessions=new Map();

function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload))}
function html(res,status,payload){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(payload)}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(new Error('Request body too large'),{status:413});chunks.push(chunk)}const raw=Buffer.concat(chunks).toString('utf8');return raw?JSON.parse(raw):{}}
function prune(){const now=Date.now();for(const [k,v] of xPending)if(now-v.createdAt>10*60*1000)xPending.delete(k);for(const [k,v] of xSessions)if(now-v.createdAt>24*60*60*1000)xSessions.delete(k)}
function publicOrigin(req){return `http://${req.headers.host||`127.0.0.1:${PORT}`}`}
async function freshXSession(connectionId){const session=xSessions.get(connectionId);if(!session)throw Object.assign(new Error('X connection not found. Connect X first.'),{status:401});if(session.expiresAt-Date.now()>60_000)return session;if(!session.refreshToken)throw Object.assign(new Error('X access token expired. Reconnect X.'),{status:401});const next=await refreshAccessToken({clientId:session.clientId,clientSecret:session.clientSecret,refreshToken:session.refreshToken});session.accessToken=next.access_token;session.refreshToken=next.refresh_token||session.refreshToken;session.expiresAt=Date.now()+Number(next.expires_in||7200)*1000;return session}

async function api(req,res,url){
  prune();
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,app:'Cleara',version:'0.2.0'});
  if(req.method==='GET'&&url.pathname==='/api/connectors')return json(res,200,{connectors});

  if(req.method==='POST'&&url.pathname==='/api/github/validate'){const {token}=await body(req);if(!token)return json(res,400,{error:'Token is required.'});return json(res,200,await validateGitHubToken(token))}
  if(req.method==='POST'&&url.pathname==='/api/github/scan'){const {token,filter={}}=await body(req);if(!token)return json(res,400,{error:'Token is required.'});const items=await listGists(token);return json(res,200,{total:items.length,matched:filterItems(items,filter)})}
  if(req.method==='POST'&&url.pathname==='/api/github/delete'){const {token,ids,confirmation}=await body(req);if(!token||!Array.isArray(ids))return json(res,400,{error:'Token and ids are required.'});if(confirmation!=='DELETE')return json(res,400,{error:'Explicit DELETE confirmation is required.'});const results=[];for(const id of ids){try{results.push(await deleteGist(token,id))}catch(error){results.push({id,deleted:false,error:error.message})}}return json(res,200,{results})}

  if(req.method==='POST'&&url.pathname==='/api/x/oauth/start'){
    const {clientId,clientSecret=''}=await body(req);
    if(!clientId)return json(res,400,{error:'X OAuth 2.0 Client ID is required.'});
    const connectionId=crypto.randomUUID();const state=createOAuthState();const {verifier,challenge}=createPkcePair();
    const redirectUri=`${publicOrigin(req)}/api/x/callback`;
    xPending.set(state,{connectionId,clientId,clientSecret,verifier,redirectUri,createdAt:Date.now()});
    return json(res,200,{connectionId,redirectUri,authorizeUrl:buildAuthorizeUrl({clientId,redirectUri,state,challenge})});
  }
  if(req.method==='GET'&&url.pathname==='/api/x/callback'){
    const state=url.searchParams.get('state');const code=url.searchParams.get('code');const denied=url.searchParams.get('error');const pending=xPending.get(state);
    if(!pending)return html(res,400,'<!doctype html><h2>Cleara: invalid or expired X OAuth state.</h2><script>window.opener?.postMessage({type:"cleara-x",ok:false},location.origin)</script>');
    xPending.delete(state);
    if(denied||!code)return html(res,400,`<!doctype html><h2>X authorization was not completed.</h2><p>${denied||'Missing authorization code.'}</p><script>window.opener?.postMessage({type:"cleara-x",ok:false},location.origin)</script>`);
    const tokens=await exchangeCode({clientId:pending.clientId,clientSecret:pending.clientSecret||undefined,code,redirectUri:pending.redirectUri,verifier:pending.verifier});
    const user=await getAuthenticatedUser(tokens.access_token);
    xSessions.set(pending.connectionId,{clientId:pending.clientId,clientSecret:pending.clientSecret||undefined,accessToken:tokens.access_token,refreshToken:tokens.refresh_token||null,expiresAt:Date.now()+Number(tokens.expires_in||7200)*1000,user,createdAt:Date.now()});
    return html(res,200,`<!doctype html><meta charset="utf-8"><title>Cleara · X connected</title><style>body{font-family:system-ui;background:#090d13;color:#e8edf4;padding:40px}</style><h2>X connected to Cleara</h2><p>You can close this window.</p><script>window.opener?.postMessage({type:"cleara-x",ok:true,connectionId:${JSON.stringify(pending.connectionId)}},location.origin);setTimeout(()=>window.close(),800)</script>`);
  }
  if(req.method==='GET'&&url.pathname==='/api/x/status'){
    const connectionId=url.searchParams.get('connectionId');const session=xSessions.get(connectionId);if(!session)return json(res,200,{connected:false});return json(res,200,{connected:true,user:session.user,expiresAt:session.expiresAt,refreshable:Boolean(session.refreshToken)});
  }
  if(req.method==='POST'&&url.pathname==='/api/x/scan'){
    const {connectionId,filter={},exclude=[],paginationToken=null,pageSize=null}=await body(req);
    const session=await freshXSession(connectionId);
    if(paginationToken!==null||pageSize!==null){
      const page=await listOwnPostsPage(session.accessToken,session.user.id,{exclude,paginationToken,maxResults:pageSize||100});
      return json(res,200,{total:page.items.length,matched:filterItems(page.items,filter),nextToken:page.nextToken,resultCount:page.resultCount,user:session.user});
    }
    const items=await listOwnPosts(session.accessToken,session.user.id,{exclude});
    return json(res,200,{total:items.length,matched:filterItems(items,filter),nextToken:null,user:session.user});
  }
  if(req.method==='POST'&&url.pathname==='/api/x/delete'){
    const {connectionId,ids,confirmation}=await body(req);if(!Array.isArray(ids)||!ids.length)return json(res,400,{error:'Select at least one X post.'});if(confirmation!=='DELETE')return json(res,400,{error:'Explicit DELETE confirmation is required.'});const session=await freshXSession(connectionId);const results=[];for(const id of ids){try{results.push(await deletePost(session.accessToken,id))}catch(error){results.push({id,deleted:false,error:error.message,status:error.status,rateLimitReset:error.rateLimitReset})}}return json(res,200,{results});
  }
  if(req.method==='POST'&&url.pathname==='/api/x/disconnect'){const {connectionId}=await body(req);xSessions.delete(connectionId);return json(res,200,{disconnected:true})}
  return false;
}

async function staticFile(_req,res,url){let pathname=url.pathname==='/'?'/index.html':url.pathname;pathname=normalize(pathname).replace(/^([.][.][/\\])+/,'');const file=join(PUBLIC,pathname);if(!file.startsWith(PUBLIC))return json(res,403,{error:'Forbidden'});try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(data)}catch{json(res,404,{error:'Not found'})}}
export function createServer(){return http.createServer(async(req,res)=>{const url=new URL(req.url,publicOrigin(req));try{if(url.pathname.startsWith('/api/')){const handled=await api(req,res,url);if(handled===false)json(res,404,{error:'API route not found'});return}await staticFile(req,res,url)}catch(error){json(res,error.status||500,{error:error.message||'Unexpected error',rateLimitReset:error.rateLimitReset})}})}
if(process.argv[1]===fileURLToPath(import.meta.url)){createServer().listen(PORT,'127.0.0.1',()=>console.log(`Cleara v0.2 running at http://127.0.0.1:${PORT}`))}

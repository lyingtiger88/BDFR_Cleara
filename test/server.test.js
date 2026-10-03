import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from '../server.js';

async function localServer(fn){
  const server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {port}=server.address();
  try{return await fn(`http://127.0.0.1:${port}`)}finally{server.close()}
}

test('health endpoint returns Cleara v0.2 metadata',()=>localServer(async base=>{
  const r=await fetch(`${base}/api/health`);const b=await r.json();
  assert.equal(r.status,200);assert.equal(b.app,'Cleara');assert.equal(b.version,'0.2.0');
}));

test('GitHub delete rejects missing explicit confirmation',()=>localServer(async base=>{
  const r=await fetch(`${base}/api/github/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'not-used',ids:['abc'],confirmation:'NO'})});
  assert.equal(r.status,400);assert.match((await r.json()).error,/confirmation/i);
}));

test('X OAuth start builds local callback and official authorize URL',()=>localServer(async base=>{
  const r=await fetch(`${base}/api/x/oauth/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'client123'})});
  const b=await r.json();assert.equal(r.status,200);assert.equal(b.redirectUri,`${base}/api/x/callback`);
  const u=new URL(b.authorizeUrl);assert.equal(u.origin,'https://x.com');assert.equal(u.searchParams.get('client_id'),'client123');assert.equal(u.searchParams.get('code_challenge_method'),'S256');
}));

test('X status is disconnected for unknown session',()=>localServer(async base=>{
  const r=await fetch(`${base}/api/x/status?connectionId=missing`);assert.deepEqual(await r.json(),{connected:false});
}));

test('X scan rejects unknown session before any remote request',()=>localServer(async base=>{
  const r=await fetch(`${base}/api/x/scan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:'missing'})});
  assert.equal(r.status,401);
}));

test('X delete requires explicit DELETE before session/network access',()=>localServer(async base=>{
  const r=await fetch(`${base}/api/x/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:'missing',ids:['1'],confirmation:'NO'})});
  assert.equal(r.status,400);assert.match((await r.json()).error,/confirmation/i);
}));

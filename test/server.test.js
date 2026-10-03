import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('health endpoint returns Cleara metadata', async()=>{
  const server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {port}=server.address();
  try{const res=await fetch(`http://127.0.0.1:${port}/api/health`);const body=await res.json();assert.equal(res.status,200);assert.equal(body.app,'Cleara');assert.equal(body.version,'0.1.0')}finally{server.close()}
});

test('delete endpoint rejects missing explicit confirmation', async()=>{
  const server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {port}=server.address();
  try{const res=await fetch(`http://127.0.0.1:${port}/api/github/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'not-used',ids:['abc'],confirmation:'NO'})});assert.equal(res.status,400);const body=await res.json();assert.match(body.error,/confirmation/i)}finally{server.close()}
});

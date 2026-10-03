const $=(id)=>document.getElementById(id);
const state={gh:[],x:[],xConnectionId:sessionStorage.getItem('cleara.x.connectionId')||''};

async function call(path,options={}){
  const res=await fetch(path,{headers:{'Content-Type':'application/json'},...options});
  const data=await res.json();
  if(!res.ok){const e=new Error(data.error||'Request failed');e.rateLimitReset=data.rateLimitReset;throw e}
  return data;
}

const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function filter(prefix){return {query:$(`${prefix}Query`).value,from:$(`${prefix}From`).value,to:$(`${prefix}To`).value}}
function render(prefix,items,total,label){
  state[prefix]=items;
  $(`${prefix}Summary`).textContent=`${items.length} matched of ${total} scanned ${label}.`;
  $(`${prefix}Delete`).disabled=!items.length;
  $(`${prefix}List`).innerHTML=items.length?items.map((x,i)=>`<div class="item"><input class="pick ${prefix}Pick" type="checkbox" data-i="${i}"><div><a href="${x.url}" target="_blank" rel="noreferrer">${esc(x.title)}</a><small>${x.createdAt?new Date(x.createdAt).toLocaleString():'date unavailable'}</small></div><span class="status">${esc(x.type)}</span></div>`).join(''):'<div class="empty">No items match the current filters.</div>';
}

async function boot(){
  try{const h=await call('/api/health');$('health').textContent=`Local · ${h.version}`;$('health').classList.add('ok')}catch{$('health').textContent='Offline'}
  const data=await call('/api/connectors');
  $('connectors').innerHTML=data.connectors.map(c=>`<div class="connector"><b>${c.name}</b><span>${c.status}</span><small>${c.capabilities.join(' · ')}</small></div>`).join('');
  $('xCallback').textContent=`${location.origin}/api/x/callback`;
  if(state.xConnectionId)await refreshXStatus();
}

$('ghConnect').onclick=async()=>{
  try{const d=await call('/api/github/validate',{method:'POST',body:JSON.stringify({token:$('ghToken').value})});$('ghIdentity').textContent=`Connected as @${d.login}`;$('ghScan').disabled=false}
  catch(e){$('ghIdentity').textContent=e.message;$('ghScan').disabled=true}
};

$('ghScan').onclick=async()=>{
  try{$('ghSummary').textContent='Scanning…';const d=await call('/api/github/scan',{method:'POST',body:JSON.stringify({token:$('ghToken').value,filter:filter('gh')})});render('gh',d.matched,d.total,'gists')}
  catch(e){$('ghSummary').textContent=e.message}
};

$('ghDelete').onclick=()=>deleteSelected('gh','/api/github/delete',{token:$('ghToken').value},'gist(s)');

$('xConnect').onclick=async()=>{
  try{
    const d=await call('/api/x/oauth/start',{method:'POST',body:JSON.stringify({clientId:$('xClientId').value.trim(),clientSecret:$('xClientSecret').value})});
    state.xConnectionId=d.connectionId;
    sessionStorage.setItem('cleara.x.connectionId',d.connectionId);
    $('xCallback').textContent=d.redirectUri;
    const popup=window.open(d.authorizeUrl,'cleara-x-oauth','width=720,height=760');
    if(!popup)throw new Error('Allow popups for Cleara, then try again.');
    $('xIdentity').textContent='Waiting for X authorization…';
  }catch(e){$('xIdentity').textContent=e.message}
};

window.addEventListener('message',async(e)=>{
  if(e.origin!==location.origin||e.data?.type!=='cleara-x')return;
  if(e.data.connectionId){state.xConnectionId=e.data.connectionId;sessionStorage.setItem('cleara.x.connectionId',e.data.connectionId)}
  await refreshXStatus();
});

async function refreshXStatus(){
  if(!state.xConnectionId)return;
  try{
    const d=await call(`/api/x/status?connectionId=${encodeURIComponent(state.xConnectionId)}`);
    if(d.connected){
      $('xIdentity').textContent=`Connected as @${d.user.username}${d.refreshable?' · refresh enabled':''}`;
      $('xScan').disabled=false;$('xDisconnect').disabled=false;
    }else{
      sessionStorage.removeItem('cleara.x.connectionId');state.xConnectionId='';$('xScan').disabled=true;
    }
  }catch(e){$('xIdentity').textContent=e.message}
}

$('xDisconnect').onclick=async()=>{
  if(state.xConnectionId)await call('/api/x/disconnect',{method:'POST',body:JSON.stringify({connectionId:state.xConnectionId})});
  sessionStorage.removeItem('cleara.x.connectionId');state.xConnectionId='';$('xIdentity').textContent='Disconnected';$('xScan').disabled=true;$('xDisconnect').disabled=true;
};

$('xScan').onclick=async()=>{
  try{
    $('xSummary').textContent='Scanning…';
    const exclude=[];
    if($('xExcludeReplies').checked)exclude.push('replies');
    if($('xExcludeRetweets').checked)exclude.push('retweets');
    const d=await call('/api/x/scan',{method:'POST',body:JSON.stringify({connectionId:state.xConnectionId,filter:filter('x'),exclude})});
    render('x',d.matched,d.total,'posts');
  }catch(e){
    $('xSummary').textContent=e.rateLimitReset?`${e.message}. Retry after ${new Date(e.rateLimitReset*1000).toLocaleTimeString()}.`:e.message;
  }
};

$('xDelete').onclick=()=>deleteSelected('x','/api/x/delete',{connectionId:state.xConnectionId},'post(s)');

async function deleteSelected(prefix,path,extra,label){
  const ids=[...document.querySelectorAll(`.${prefix}Pick:checked`)].map(el=>state[prefix][Number(el.dataset.i)].id);
  if(!ids.length)return alert('Select at least one item.');
  const confirmation=prompt(`This permanently deletes ${ids.length} ${label}. Type DELETE to continue:`);
  if(confirmation!=='DELETE')return;
  try{
    const d=await call(path,{method:'POST',body:JSON.stringify({...extra,ids,confirmation})});
    const ok=d.results.filter(x=>x.deleted).length;const failed=d.results.length-ok;
    alert(`${ok}/${ids.length} deleted${failed?` · ${failed} failed`:''}.`);
    prefix==='x'?$('xScan').click():$('ghScan').click();
  }catch(e){alert(e.message)}
}

document.querySelectorAll('.service').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.service').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  const x=b.dataset.service==='x';$('xPanel').hidden=!x;$('githubPanel').hidden=x;
});

document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  const about=b.dataset.view==='about';$('dashboard').hidden=about;$('about').hidden=!about;
});

boot();

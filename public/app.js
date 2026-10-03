const $ = (id) => document.getElementById(id);
const state = { connected:false, matched:[] };

async function call(path, options={}) {
  const res = await fetch(path,{headers:{'Content-Type':'application/json'},...options});
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function boot(){
  try{const h=await call('/api/health');$('health').textContent=`Local · ${h.version}`;$('health').classList.add('ok')}catch{$('health').textContent='Offline'}
  const data=await call('/api/connectors');
  $('connectors').innerHTML=data.connectors.map(c=>`<div class="connector"><b>${c.name}</b><span>${c.status}</span></div>`).join('');
}

$('connect').onclick=async()=>{
  try{const data=await call('/api/github/validate',{method:'POST',body:JSON.stringify({token:$('token').value})});state.connected=true;$('identity').textContent=`Connected as @${data.login}`;$('scan').disabled=false}
  catch(e){state.connected=false;$('identity').textContent=e.message;$('scan').disabled=true}
};

$('scan').onclick=async()=>{
  $('summary').textContent='Scanning…';
  try{const data=await call('/api/github/scan',{method:'POST',body:JSON.stringify({token:$('token').value,filter:{query:$('query').value,from:$('from').value,to:$('to').value}})});state.matched=data.matched;render(data.total)}catch(e){$('summary').textContent=e.message}
};

function render(total){
  $('summary').textContent=`${state.matched.length} matched of ${total} scanned gists.`;
  $('delete').disabled=state.matched.length===0;
  $('list').innerHTML=state.matched.length?state.matched.map((x,i)=>`<div class="item"><input class="pick" type="checkbox" data-i="${i}"><div><a href="${x.url}" target="_blank" rel="noreferrer">${escapeHtml(x.title)}</a><small>${new Date(x.createdAt).toLocaleString()} · ${x.public?'public':'secret'}</small></div><span class="status">gist</span></div>`).join(''):'<div class="empty">No items match the current filters.</div>';
}

$('delete').onclick=async()=>{
  const ids=[...document.querySelectorAll('.pick:checked')].map(el=>state.matched[Number(el.dataset.i)].id);
  if(!ids.length) return alert('Select at least one item.');
  const confirmation=prompt(`This permanently deletes ${ids.length} gist(s). Type DELETE to continue:`);
  if(confirmation!=='DELETE') return;
  try{const data=await call('/api/github/delete',{method:'POST',body:JSON.stringify({token:$('token').value,ids,confirmation})});const ok=data.results.filter(x=>x.deleted).length;alert(`${ok}/${ids.length} deleted.`);$('scan').click()}catch(e){alert(e.message)}
};

function escapeHtml(v=''){return v.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

document.querySelectorAll('.nav').forEach((button)=>button.onclick=()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));button.classList.add('active');const about=button.dataset.view==='about';$('dashboard').hidden=about;$('about').hidden=!about});
boot();

const $=s=>document.querySelector(s);let current='leads';
const labels={leads:'לידים',families:'משפחות',workers:'עובדים',matches:'התאמות'};
async function api(url,body,method='POST'){const r=await fetch('/api/'+url,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
function message(e){$('#notice').textContent=e.message||e;}
function cell(row,value){const td=document.createElement('td');td.textContent=value||'—';row.append(td);return td;}
async function refresh(){try{$('#title').textContent=labels[current];const data=await api(current);$('#rows').replaceChildren();for(const r of data){const tr=document.createElement('tr');for(const key of ['name','status','owner','due'])cell(tr,r[key]);const b=document.createElement('button');b.textContent='עריכה';b.onclick=()=>{for(const key of ['id','name','status','owner','due','skills','notes'])$('#editor').elements[key].value=r[key]||'';};cell(tr,'').replaceChildren(b);$('#rows').append(tr);}}catch(e){message(e);}}
async function show(){ $('#login').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;$('#nav').replaceChildren();for(const [kind,label] of Object.entries(labels)){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{current=kind;$('#editor').reset();refresh();};$('#nav').append(b);}await refresh();}
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await api('login',Object.fromEntries(new FormData(e.target)));message('');await show();}catch(e){message(e);}};
$('#editor').onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target)),id=data.id;delete data.id;await api(current+(id?'/'+id:''),data,id?'PUT':'POST');e.target.reset();message('נשמר בהצלחה');refresh();}catch(e){message(e);}};
$('#reset').onclick=()=>$('#editor').reset();$('#logout').onclick=async()=>{await api('logout',{});location.reload();};
api('me').then(show).catch(()=>{});

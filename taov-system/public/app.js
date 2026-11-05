const $=s=>document.querySelector(s);let current='leads';
const labels={leads:'לידים',families:'משפחות',workers:'עובדים',matches:'התאמות',cases:'תיקים',tasks:'משימות',documents:'מסמכים',notifications:'התראות מדומות'};
async function api(url,body,method='POST'){const r=await fetch('/api/'+url,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
function message(e){$('#notice').textContent=e.message||e;}
function cell(row,value){const td=document.createElement('td');td.textContent=value||'—';row.append(td);return td;}
async function refresh(){try{$('#title').textContent=labels[current];$('#editor').hidden=false;const data=await api(current);$('#rows').replaceChildren();for(const r of data){const tr=document.createElement('tr');for(const key of ['name','status','owner','due'])cell(tr,r[key]);const b=document.createElement('button');b.textContent='עריכה';b.onclick=()=>{for(const key of ['id','name','status','owner','due','skills','notes'])$('#editor').elements[key].value=r[key]||'';};cell(tr,'').replaceChildren(b);$('#rows').append(tr);}}catch(e){message(e);}}
async function show(){ $('#login').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;$('#nav').replaceChildren();for(const [kind,label] of Object.entries(labels)){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{current=kind;$('#editor').reset();refresh();};$('#nav').append(b);}await refresh();renderTools();}
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await api('login',Object.fromEntries(new FormData(e.target)));message('');await show();}catch(e){message(e);}};
$('#editor').onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target)),id=data.id;delete data.id;await api(current+(id?'/'+id:''),data,id?'PUT':'POST');e.target.reset();message('נשמר בהצלחה');refresh();}catch(e){message(e);}};
$('#reset').onclick=()=>$('#editor').reset();$('#logout').onclick=async()=>{await api('logout',{});location.reload();};
api('me').then(show).catch(()=>{});

function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{try{await fn();}catch(e){message(e);}};return b;}
function output(data){let box=$('#output');if(!box){box=document.createElement('pre');box.id='output';$('#tools').after(box);}box.textContent=JSON.stringify(data,null,2);}
function download(name,data,type='application/json'){const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderTools(){const tools=$('#tools');tools.replaceChildren();
const query=document.createElement('input');query.placeholder='למשל: משימות פתוחות באיחור';query.setAttribute('aria-label','חיפוש בשפה חופשית');tools.append(query,button('שאל את תאוב',async()=>output(await api('assistant',{query:query.value}))),
button('דוח מצב',async()=>output(await api('report'))),button('ייצוא דוח',async()=>download('taov-report.json',await api('report'))),
button('הרץ בקרה',async()=>{output(await api('control',{}));refresh();}),button('הצעות התאמה',async()=>output(await api('suggestions'))),
button('היסטוריית פעולות',async()=>output(await api('history'))),
button('גיבוי מוצפן',async()=>{const passphrase=prompt('סיסמת גיבוי — לפחות 12 תווים. שמור אותה בנפרד. הגיבוי אינו כולל חשבונות משתמשים.');if(passphrase)download('taov-backup.enc',await api('backup',{passphrase}));}),
button('שחזור מגיבוי',async()=>{const file=document.createElement('input');file.type='file';file.accept='.enc,application/json';file.onchange=async()=>{try{const backup=JSON.parse(await file.files[0].text()),passphrase=prompt('סיסמת הגיבוי');if(!passphrase||!confirm('למזג נתונים מהגיבוי? רשומות קיימות יישמרו.'))return;output(await api('restore',{backup,passphrase,confirm:'RESTORE'}));refresh();}catch(e){message(e);}};file.click();}),
button('Google Sheets — קריאה',async()=>{const spreadsheetId=prompt('מזהה גיליון סינתטי בלבד');if(!spreadsheetId)return;const range=prompt('טווח לקריאה','A1:Z100');if(range)output(await api('sheets/read',{spreadsheetId,range}));}),
button('ניהול משתמשים',async()=>output(await api('users'))),
button('הוספת משתמש',async()=>{const name=prompt('שם משתמש באנגלית (לפחות 3 תווים)');if(!name)return;const password=prompt('סיסמה זמנית — לפחות 12 תווים');if(!password)return;const role=prompt('תפקיד: admin / editor / viewer','viewer');if(role)output(await api('users',{name,password,role}));}));
}

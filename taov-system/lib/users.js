import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export function userManagement(db,sessions,log){
 if(!db.prepare('PRAGMA table_info(accounts)').all().some(c=>c.name==='disabled'))db.exec('ALTER TABLE accounts ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
 const invalidate=name=>{for(const [token,s] of sessions)if(s.name===name)sessions.delete(token);};
 const passwordValid=p=>typeof p==='string'&&p.length>=12&&p.length<=256;
 const updatePassword=(name,p)=>{if(!passwordValid(p))throw Error('סיסמה חייבת להכיל 12–256 תווים');const salt=randomBytes(16).toString('hex');db.prepare('UPDATE accounts SET salt=?,hash=? WHERE name=?').run(salt,scryptSync(p,salt,64).toString('hex'),name);invalidate(name);};
 return async({url,req,body,session,role,send})=>{
  if(url.pathname==='/api/password'&&req.method==='POST'){
   const account=db.prepare('SELECT * FROM accounts WHERE name=?').get(session.name);
   if(typeof body.currentPassword!=='string'||!timingSafeEqual(scryptSync(body.currentPassword,account.salt,64),Buffer.from(account.hash,'hex')))return send(403,{error:'הסיסמה הנוכחית אינה נכונה'});
   updatePassword(session.name,body.password);log(session.name,'change own password',session.name);return send(200,{ok:true,relogin:true});
  }
  if(!url.pathname.startsWith('/api/users'))return false;
  if(role!=='admin')return send(403,{error:'נדרשת הרשאת מנהל'});
  if(url.pathname==='/api/users'&&req.method==='GET')return send(200,db.prepare('SELECT accounts.name,roles.role,accounts.disabled FROM accounts LEFT JOIN roles USING(name) ORDER BY accounts.name').all());
  if(url.pathname==='/api/users'&&req.method==='POST'){
   if(!/^[a-zA-Z0-9_-]{3,40}$/.test(body.name||'')||!passwordValid(body.password)||!['admin','editor','viewer'].includes(body.role))return send(400,{error:'שם משתמש ותפקיד תקינים וסיסמה באורך 12–256 תווים נדרשים'});
   if(db.prepare('SELECT name FROM accounts WHERE name=?').get(body.name))return send(409,{error:'שם משתמש כבר קיים'});
   const salt=randomBytes(16).toString('hex');db.exec('BEGIN');try{db.prepare('INSERT INTO accounts(name,salt,hash) VALUES(?,?,?)').run(body.name,salt,scryptSync(body.password,salt,64).toString('hex'));db.prepare('INSERT INTO roles VALUES(?,?)').run(body.name,body.role);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}log(session.name,'create user',body.name);return send(201,{ok:true});
  }
  const match=/^\/api\/users\/([a-zA-Z0-9_-]+)(\/password)?$/.exec(url.pathname);
  if(!match)return send(404,{error:'לא נמצא'});
  const name=match[1],account=db.prepare('SELECT accounts.name,disabled,role FROM accounts JOIN roles USING(name) WHERE name=?').get(name);
  if(!account)return send(404,{error:'משתמש לא נמצא'});
  if(match[2]&&req.method==='POST'){updatePassword(name,body.password);log(session.name,'reset password',name);return send(200,{ok:true,relogin:true});}
  if(!match[2]&&req.method==='PATCH'){
   if(body.role!==undefined&&!['admin','editor','viewer'].includes(body.role)||body.disabled!==undefined&&typeof body.disabled!=='boolean')return send(400,{error:'תפקיד או מצב לא תקינים'});
   const nextRole=body.role??account.role,disabled=body.disabled===undefined?!!account.disabled:body.disabled;
   if(account.role==='admin'&&!account.disabled&&(nextRole!=='admin'||disabled)&&db.prepare("SELECT COUNT(*) n FROM accounts JOIN roles USING(name) WHERE role='admin' AND disabled=0").get().n<=1)return send(409,{error:'לא ניתן להשבית או להוריד הרשאות למנהל הפעיל האחרון'});
   db.exec('BEGIN');try{db.prepare('UPDATE accounts SET disabled=? WHERE name=?').run(Number(disabled),name);db.prepare('UPDATE roles SET role=? WHERE name=?').run(nextRole,name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   invalidate(name);log(session.name,'update user',name+':'+nextRole+':'+(disabled?'disabled':'active'));return send(200,{ok:true});
  }
  return send(405,{error:'פעולה אינה נתמכת'});
 };
}

import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,readdirSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {localDate} from './report.js';
export function encryptSnapshot(snapshot,passphrase){const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',scryptSync(passphrase,salt,32),iv);const ciphertext=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);return {version:2,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}
export function decryptSnapshot(backup,passphrase){const dec=createDecipheriv('aes-256-gcm',scryptSync(passphrase,Buffer.from(backup.salt,'base64'),32),Buffer.from(backup.iv,'base64'));dec.setAuthTag(Buffer.from(backup.tag,'base64'));return JSON.parse(Buffer.concat([dec.update(Buffer.from(backup.ciphertext,'base64')),dec.final()]).toString());}
export function automaticBackups({db,directory,log,passphrase=process.env.BACKUP_PASSPHRASE,retention=Number(process.env.BACKUP_RETENTION_DAYS||14),now=()=>new Date()}){
 if(!Number.isInteger(retention)||retention<2||retention>365)throw Error('BACKUP_RETENTION_DAYS must be 2–365');
 const backupDir=path.join(directory,'backups'),keyPath=path.join(directory,'backup.key');mkdirSync(backupDir,{recursive:true,mode:0o700});
 const external=!!passphrase;
 if(!passphrase){if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32).toString('base64url'),{mode:0o600,flag:'wx'});passphrase=readFileSync(keyPath,'utf8').trim();}
 if(passphrase.length<20)throw Error('Backup encryption key must contain at least 20 characters');
 let lastError=null;
 const files=()=>readdirSync(backupDir).filter(f=>/^taov-\d{4}-\d{2}-\d{2}\.enc\.json$/.test(f)).sort().reverse();
 function runDaily(date=now()){
  const day=localDate(date),filename='taov-'+day+'.enc.json',target=path.join(backupDir,filename);
  try{
   if(existsSync(target)){decryptSnapshot(JSON.parse(readFileSync(target,'utf8')),passphrase);lastError=null;return {created:false,filename};}
   const snapshot={version:2,createdAt:date.toISOString(),records:db.prepare('SELECT * FROM records').all(),audit:db.prepare('SELECT * FROM audit').all(),accounts:db.prepare('SELECT * FROM accounts').all(),roles:db.prepare('SELECT * FROM roles').all()};
   const temp=target+'.tmp-'+randomBytes(6).toString('hex');writeFileSync(temp,JSON.stringify(encryptSnapshot(snapshot,passphrase)),{mode:0o600,flag:'wx'});renameSync(temp,target);
   log('system','daily encrypted backup',filename);for(const old of files().slice(retention))unlinkSync(path.join(backupDir,old));lastError=null;return {created:true,filename};
  }catch(e){lastError='גיבוי נכשל; בדוק הרשאות דיסק, מקום פנוי ומפתח הצפנה';throw e;}
 }
 return {runDaily,status:()=>({enabled:true,timezone:'Asia/Jerusalem',retention,keySource:external?'environment':'local-file',lastError,files:files()}),read:name=>{if(!files().includes(name))throw Error('גיבוי לא נמצא');return JSON.parse(readFileSync(path.join(backupDir,name),'utf8'));},exportKey:()=>{if(external)throw Error('מפתח סביבה אינו ניתן להורדה; יש לשמור אותו בניהול הסודות');return passphrase;}};
}

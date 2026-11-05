import {createHash} from 'node:crypto';
export function signatureRoutes({url,req,body,session,send,list,save,log}){
 if(url.pathname!=='/api/signature-drafts')return false;
 if(req.method==='GET')return send(200,list('signatures'));
 if(req.method!=='POST')return send(405,{error:'טיוטות בלבד; אין פעולת שליחה או חתימה'});
 const doc=list('documents').find(d=>d.id===body.documentId);
 if(!doc)return send(400,{error:'יש לבחור מסמך קיים'});
 if(typeof body.signerName!=='string'||!body.signerName.trim()||body.signerName.length>200||body.synthetic!==true)return send(400,{error:'נדרש שם חותם סינתטי ואישור נתונים סינתטיים'});
 const draft=save('signatures',{name:'בקשת חתימה — '+doc.name,documentId:doc.id,documentVersion:doc.updatedAt,documentHash:createHash('sha256').update(JSON.stringify(doc)).digest('hex'),signerName:body.signerName.trim(),caseId:doc.caseId||'',status:'טיוטה בלבד',simulation:true,notes:'לא נשלחה בקשת חתימה; לא נחתם מסמך',createdBy:session.name});
 log(session.name,'signature draft',draft.id);return send(201,draft);
}

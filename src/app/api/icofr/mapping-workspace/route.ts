import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { resolveServerActiveInstitutionId } from '@/lib/institution-context';
export const dynamic = 'force-dynamic';
type Row = Record<string, unknown>;
type DB = {prepare:(sql:string)=>{bind:(...values:unknown[])=>{all:<T>()=>Promise<{results?:T[]}>}}};
export async function GET() {
 try {
  const institutionId = await resolveServerActiveInstitutionId();
  if (!institutionId) return NextResponse.json({error:'Institution required'}, {status:409});
  const {env}=await getCloudflareContext({async:true});
  const db=(env as unknown as {DB:DB}).DB;
  const q=async<T=Row>(sql:string,params:unknown[]=[])=> (await db.prepare(sql).bind(...params).all<T>()).results||[];
  const [items,processes,risks,controls,domains,sources]=await Promise.all([
   q<Row>('SELECT id,itemCode,name,recordType,financialStatement,processReference,scopingRationale,status FROM ICOFRFinancialItem WHERE institutionId=? AND significant=1 ORDER BY itemCode',[institutionId]),
   q<Row>(`SELECT DISTINCT f.id financialItemId,b.id processId,b.processId processCode,b.name processName,l.sourceReference
 FROM ICOFRScopeLink l JOIN ICOFRScope s ON s.id=l.scopeId AND s.institutionId=?
 JOIN ICOFRScopeItem fi ON fi.id=l.fromItemId AND fi.scopeId=l.scopeId AND fi.itemType='Financial Account'
 JOIN ICOFRFinancialItem f ON f.id=fi.sourceId AND f.institutionId=s.institutionId AND f.significant=1
 JOIN ICOFRScopeItem pi ON pi.id=l.toItemId AND pi.scopeId=l.scopeId AND pi.itemType='Business Process'
 JOIN BusinessProcess b ON b.id=pi.sourceId AND b.institutionId=s.institutionId WHERE l.relationType='FSLI_TO_PROCESS'`,[institutionId]),
   q<Row>('SELECT id,riskId,name,processId FROM RiskMaster WHERE institutionId=?',[institutionId]),
   q<Row>(`SELECT c.id,c.controlId,c.name,c.processId,c.isIcofrKey,c.isKeyControl,m.riskId FROM ControlMaster c LEFT JOIN ControlRiskMapping m ON m.controlId=c.id WHERE c.institutionId=?`,[institutionId]),
   q<Row>('SELECT id,controlCode,name,category,sourceControlId FROM ICOFRControlDomain WHERE institutionId=?',[institutionId]),
   q<Row>(`SELECT s.recordKey,s.recordTitle,s.payloadJson,d.title sourceTitle,d.rawSha256 FROM SourceStructuredRecord s JOIN SourceDocument d ON d.id=s.sourceDocumentId AND d.institutionId=s.institutionId WHERE s.institutionId=? AND s.recordType='ICOFR_SIGNIFICANT_ACCOUNT'`,[institutionId])
  ]);
  const sourceByName=new Map(sources.map(s=>[String(s.recordTitle).trim().toLowerCase(),s]));
  const processByItem=new Map<string,Row[]>();
  for(const p of processes){const k=String(p.financialItemId);processByItem.set(k,[...(processByItem.get(k)||[]),p]);}
  const output=items.map(item=>{
   const mapped=processByItem.get(String(item.id))||[];
   const processIds=new Set(mapped.map(p=>String(p.processId)));
   const candidateRisks=risks.filter(r=>processIds.has(String(r.processId)));
   const riskIds=new Set(candidateRisks.map(r=>String(r.id)));
   const candidateControls=controls.filter(c=>riskIds.has(String(c.riskId)));
   const source=sourceByName.get(String(item.name).trim().toLowerCase());
   const plcControls=candidateControls.filter(c=>domains.some(d=>String(d.sourceControlId)===String(c.id)&&d.category==='PLC'));
   return {item,processes:mapped,risks:candidateRisks,controls:candidateControls,source:source?{recordKey:source.recordKey,title:source.sourceTitle,sha256:source.rawSha256,payload:source.payloadJson}:null,plcGap:plcControls.length===0,reviewStatus:'PROPOSAL_ONLY',assertionCandidates:[],warning:'Assertions must be selected from source evidence by a human reviewer; no auto-approval or production writes.'};
  });
  return NextResponse.json({institutionId,counts:{items:items.length,processPairs:processes.length,plcGaps:output.filter(x=>x.plcGap).length},items:output,readOnly:true});
 } catch(e){console.error('ICOFR mapping workspace:',e);return NextResponse.json({error:'Unable to read mapping workspace'},{status:503});}
}

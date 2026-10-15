import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureIcofrTraceabilitySchema, saveTraceabilityChain, STANDARD_ASSERTIONS } from '@/lib/d1-icofr-traceability';
import { resolveServerActiveInstitutionId } from '@/lib/institution-context';
import type { AuthUserProfile } from '@/lib/auth';

type Row = Record<string, any>;
type Database = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => { all: <T=Row>()=>Promise<{results?:T[]}>; first:<T=Row>()=>Promise<T|null>; run:()=>Promise<{meta?:{changes?:number}}> };
    all: <T=Row>()=>Promise<{results?:T[]}>;
    run: ()=>Promise<{meta?:{changes?:number}}>;
  };
};
export type MappingStatus = 'DRAFT'|'OWNER_REVIEWED'|'ICOFR_REVIEWED'|'APPROVED'|'PUBLISHED'|'REJECTED';
const REVIEW_STAGES: Record<string, {from: MappingStatus[];to: MappingStatus;roles: string[]}> = {
  OWNER_REVIEW: {from:['DRAFT'],to:'OWNER_REVIEWED',roles:['ProcessOwner']},
  ICOFR_REVIEW: {from:['OWNER_REVIEWED'],to:'ICOFR_REVIEWED',roles:['ICOFRCoordinator']},
  APPROVE: {from:['ICOFR_REVIEWED'],to:'APPROVED',roles:['Reviewer']},
  REJECT: {from:['DRAFT','OWNER_REVIEWED','ICOFR_REVIEWED','APPROVED'],to:'REJECTED',roles:['Reviewer','ICOFRCoordinator']},
  PUBLISH: {from:['APPROVED'],to:'PUBLISHED',roles:['ICOFRCoordinator']}
};
const ALLOWED_MAKERS=['ICOFRCoordinator','SystemAdmin'];
const clean = (value:unknown,max=1000)=>typeof value==='string'?value.trim().slice(0,max):'';
const norm = (value:unknown)=>clean(value,500).toLowerCase().normalize('NFKC').replace(/\s+/g,' ');
const isKey=(c:Row)=>Number(c.isKeyControl)===1||Number(c.isIcofrKey)===1;
const err=(code:string):never=>{throw new Error(code);};
const targetStatus=(row:Row)=>String(row.status||'DRAFT') as MappingStatus;
let schemaReady:Promise<void>|null=null;

async function db():Promise<Database> {
  await ensureIcofrTraceabilitySchema();
  const {env}=await getCloudflareContext({async:true});
  const database=(env as unknown as {DB?:Database}).DB;
  if(!database) err('DB_UNAVAILABLE');
  return database!;
}
async function all(database:Database,sql:string,bindings:unknown[]=[]):Promise<Row[]>{
  const q=database.prepare(sql);
  const r=bindings.length?await q.bind(...bindings).all():await q.all();
  return r.results||[];
}
async function first(database:Database,sql:string,bindings:unknown[]=[]):Promise<Row|null>{
  const q=database.prepare(sql);return bindings.length?q.bind(...bindings).first():q.all().then(r=>r.results?.[0]||null);
}
async function run(database:Database,sql:string,bindings:unknown[]=[]){
  return database.prepare(sql).bind(...bindings).run();
}
async function ensureSchema(database:Database){
  if(!schemaReady) schemaReady=(async()=>{
    const ddl=[
      `CREATE TABLE IF NOT EXISTS ICOFRMappingProposal(
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, financialItemId TEXT NOT NULL,
        assertion TEXT NOT NULL, riskId TEXT NOT NULL, controlMasterId TEXT NOT NULL,
        controlDomainId TEXT, rationale TEXT NOT NULL, sourceDocumentId TEXT NOT NULL,
        sourceRecordKey TEXT NOT NULL, sourceHash TEXT NOT NULL, sourceReference TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT', createdBy TEXT NOT NULL,
        ownerReviewedBy TEXT, icofrReviewedBy TEXT, approvedBy TEXT, publishedBy TEXT,
        version INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
      'CREATE INDEX IF NOT EXISTS idx_icofr_mapping_tenant_item ON ICOFRMappingProposal(institutionId,financialItemId,status)',
      'CREATE INDEX IF NOT EXISTS idx_icofr_mapping_tenant_status ON ICOFRMappingProposal(institutionId,status)',
      `CREATE TABLE IF NOT EXISTS ICOFRMappingReviewEvent(
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, proposalId TEXT NOT NULL,
        action TEXT NOT NULL, fromStatus TEXT, toStatus TEXT NOT NULL,
        actorId TEXT NOT NULL, actorRole TEXT NOT NULL, note TEXT NOT NULL,
        createdAt TEXT NOT NULL)`,
      'CREATE INDEX IF NOT EXISTS idx_icofr_mapping_review_tenant ON ICOFRMappingReviewEvent(institutionId,proposalId,createdAt)'
    ];
    for(const sql of ddl) await database.prepare(sql).run();
  })().catch(e=>{schemaReady=null;throw e;});
  await schemaReady;
}
function pickAssertion(item:Row,risk:Row):string[]{
  // Explainable baseline, not a finding. AI may subsequently recommend a subset.
  const text=norm([item.name,risk.name,risk.description].join(' '));
  const a=new Set<string>();
  if(/cadangan|ckpn|penurunan nilai|impair|revaluasi|nilai wajar|estimasi|pajak|amortisasi|penyusutan/.test(text))a.add('Valuation / Allocation');
  if(/pendapatan|bunga|fee|beban|provisi|transaksi|komisi/.test(text))a.add('Accuracy');
  if(/kewajiban|utang|simpanan|komitmen|kontinjensi|liabilitas|giro/.test(text))a.add('Completeness');
  if(/kredit|aset|kas|surat berharga|penempatan|piutang/.test(text))a.add('Existence / Occurrence');
  if(/rekonsiliasi|pembukuan|pencatatan|pelaporan|salah saji/.test(text))a.add('Accuracy');
  if(/laporan|pengungkapan|disajikan|klasifikasi|ekuitas/.test(text))a.add('Presentation & Disclosure');
  if(/akhir periode|cut.off|tutup buku|akrual/.test(text))a.add('Cut-off');
  return Array.from(a).filter(x=>(STANDARD_ASSERTIONS as readonly string[]).includes(x)).slice(0,4);
}
export async function getMappingWorkspace(institutionId:string){
  const database=await db();await ensureSchema(database);
  const q=[
    all(database,`SELECT id,itemCode,name,financialStatement,processReference,scopingRationale,significant,status
      FROM ICOFRFinancialItem WHERE institutionId=? AND significant=1 ORDER BY itemCode`,[institutionId]),
    all(database,`SELECT DISTINCT f.id financialItemId,b.id processId,b.processId processCode,b.name processName,
      l.sourceReference FROM ICOFRScopeLink l
      JOIN ICOFRScope s ON s.id=l.scopeId AND s.institutionId=?
      JOIN ICOFRScopeItem fi ON fi.id=l.fromItemId AND fi.scopeId=l.scopeId AND fi.itemType='Financial Account'
      JOIN ICOFRFinancialItem f ON f.id=fi.sourceId AND f.institutionId=s.institutionId AND f.significant=1
      JOIN ICOFRScopeItem pi ON pi.id=l.toItemId AND pi.scopeId=l.scopeId AND pi.itemType='Business Process'
      JOIN BusinessProcess b ON b.id=pi.sourceId AND b.institutionId=s.institutionId
      WHERE l.relationType='FSLI_TO_PROCESS' ORDER BY f.itemCode,b.processId`,[institutionId]),
    all(database,'SELECT id,processId,riskId,name,description,status FROM RiskMaster WHERE institutionId=?',[institutionId]),
    all(database,'SELECT id,processId,controlId,name,objective,description,isKeyControl,isIcofrKey,status FROM ControlMaster WHERE institutionId=?',[institutionId]),
    all(database,`SELECT m.controlId,m.riskId FROM ControlRiskMapping m
      JOIN RiskMaster r ON r.id=m.riskId AND r.institutionId=?
      JOIN ControlMaster c ON c.id=m.controlId AND c.institutionId=r.institutionId`,[institutionId]),
    all(database,'SELECT id,sourceControlId,category,controlCode,name,status FROM ICOFRControlDomain WHERE institutionId=?',[institutionId]),
    all(database,`SELECT s.recordKey,s.recordTitle,s.sourceDocumentId,d.title sourceTitle,d.rawSha256 sourceHash
      FROM SourceStructuredRecord s JOIN SourceDocument d ON d.id=s.sourceDocumentId
      AND d.institutionId=s.institutionId
      WHERE s.institutionId=? AND s.recordType='ICOFR_SIGNIFICANT_ACCOUNT'
      AND s.status<>'RETIRED' ORDER BY s.precedencePriority ASC`,[institutionId]),
    all(database,'SELECT * FROM ICOFRMappingProposal WHERE institutionId=? ORDER BY updatedAt DESC LIMIT 300',[institutionId])
  ];
  const [items,scoping,risks,controls,mappings,domains,sources,proposals]=await Promise.all(q);
  const processByItem=new Map<string,Row[]>();
  for(const p of scoping)processByItem.set(String(p.financialItemId),[...(processByItem.get(String(p.financialItemId))||[]),p]);
  const sourceByTitle=new Map<string,Row>();
  for(const s of sources)if(!sourceByTitle.has(norm(s.recordTitle)))sourceByTitle.set(norm(s.recordTitle),s);
  const controlById=new Map(controls.map(c=>[String(c.id),c]));
  const domainByControl=new Map(domains.filter(d=>d.sourceControlId).map(d=>[String(d.sourceControlId),d]));
  const linksByRisk=new Map<string,Row[]>();
  for(const m of mappings){const control=controlById.get(String(m.controlId));if(!control)continue;linksByRisk.set(String(m.riskId),[...(linksByRisk.get(String(m.riskId))||[]),control]);}
  const proposed=items.map(item=>{
    const mapped=processByItem.get(String(item.id))||[];
    const processIds=new Set(mapped.map(p=>String(p.processId)));
    const related=risks.filter(r=>processIds.has(String(r.processId)));
    const candidates=related.flatMap(r=>(linksByRisk.get(String(r.id))||[]).map(c=>{
      const domain=domainByControl.get(String(c.id));
      return {riskId:r.id,riskCode:r.riskId,riskName:r.name,riskStatus:r.status,
        processId:r.processId,controlId:c.id,controlCode:c.controlId,controlName:c.name,
        controlStatus:c.status,domainId:domain?.id||null,domainCategory:domain?.category||null,
        keyControl:isKey(c),assertions:pickAssertion(item,r)};
    })).sort((a,b)=>Number(Boolean(b.keyControl))-Number(Boolean(a.keyControl))||
      Number(Boolean(b.domainCategory==='PLC'))-Number(Boolean(a.domainCategory==='PLC'))||
      a.riskCode.localeCompare(b.riskCode));
    const source=sourceByTitle.get(norm(item.name))||null;
    const plcCandidates=candidates.filter(c=>c.domainCategory==='PLC');
    return {...item,id:String(item.id),itemCode:String(item.itemCode),name:String(item.name),financialStatement:String(item.financialStatement),source:source?{recordKey:source.recordKey,documentId:source.sourceDocumentId,
      documentTitle:source.sourceTitle,sha256:source.sourceHash}:null,
      processes:mapped.map(p=>({id:p.processId,code:p.processCode,name:p.processName,sourceReference:p.sourceReference})),
      riskControlCandidates:candidates.slice(0,60),candidateCount:candidates.length,
      plcGap:plcCandidates.length===0,plcCandidates:plcCandidates.length,
      proposedAssertions:Array.from(new Set(candidates.flatMap(c=>c.assertions))).slice(0,8),
      proposals:proposals.filter(p=>p.financialItemId===item.id)};
  });
  return {items:proposed,summary:{significantItems:items.length,scopingPairs:scoping.length,
    itemsWithProcesses:proposed.filter(i=>i.processes.length>0).length,
    itemsWithCandidates:proposed.filter(i=>i.candidateCount>0).length,
    missingPlc:proposed.filter(i=>i.plcGap).length,
    itemsWithoutSource:proposed.filter(i=>!i.source).length,
    proposals:proposals.length,
    approved:proposals.filter(p=>p.status==='APPROVED').length,
    published:proposals.filter(p=>p.status==='PUBLISHED').length},
    statuses:REVIEW_STAGES};
}
export async function createMappingProposal(institutionId:string,actor:AuthUserProfile,input:Row){
  if(!ALLOWED_MAKERS.includes(actor.role))err('MAPPING_ROLE_DENIED');
  const financialItemId=clean(input.financialItemId,100),assertion=clean(input.assertion,100),
    riskId=clean(input.riskId,100),controlMasterId=clean(input.controlMasterId,100),
    rationale=clean(input.rationale,3000),sourceReference=clean(input.sourceReference,600);
  if(!STANDARD_ASSERTIONS.includes(assertion as typeof STANDARD_ASSERTIONS[number]))err('INVALID_ASSERTION');
  if(rationale.length<50||sourceReference.length<12)err('SOURCE_RATIONALE_REQUIRED');
  const workspace=await getMappingWorkspace(institutionId);
  const item=workspace.items.find(x=>x.id===financialItemId);
  if(!item||!item.source) throw new Error('SOURCE_DOCUMENT_REQUIRED');
  const candidate=item.riskControlCandidates.find(x=>x.riskId===riskId&&x.controlId===controlMasterId);
  if(!candidate) throw new Error('SOURCE_CHAIN_NOT_FOUND');
  const database=await db();
  const existing=await first(database,`SELECT id FROM ICOFRMappingProposal WHERE institutionId=? AND financialItemId=?
    AND assertion=? AND riskId=? AND controlMasterId=? AND status NOT IN ('REJECTED') LIMIT 1`,
    [institutionId,financialItemId,assertion,riskId,controlMasterId]);
  if(existing)err('PROPOSAL_EXISTS');
  const id=crypto.randomUUID(), now=new Date().toISOString();
  await run(database,`INSERT INTO ICOFRMappingProposal(id,institutionId,financialItemId,assertion,riskId,controlMasterId,
    controlDomainId,rationale,sourceDocumentId,sourceRecordKey,sourceHash,sourceReference,status,createdBy,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?)`,[
      id,institutionId,financialItemId,assertion,riskId,controlMasterId,candidate.domainId,rationale,
      item.source.documentId,item.source.recordKey,item.source.sha256,sourceReference,actor.id,now,now
    ]);
  await logReview(database,institutionId,id,'CREATE',null,'DRAFT',actor,rationale);
  return {id,status:'DRAFT'};
}
async function logReview(database:Database,institutionId:string,id:string,action:string,
  from:string|null,to:string,actor:AuthUserProfile,note:string){
  await run(database,`INSERT INTO ICOFRMappingReviewEvent
    (id,institutionId,proposalId,action,fromStatus,toStatus,actorId,actorRole,note,createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,[crypto.randomUUID(),institutionId,id,action,from,to,actor.id,actor.role,note,new Date().toISOString()]);
}
export async function updateMappingStage(institutionId:string,actor:AuthUserProfile,input:Row){
  const id=clean(input.id,100),action=clean(input.action,30),note=clean(input.note,2000);
  const stage=REVIEW_STAGES[action];
  if(!stage||!stage.roles.includes(actor.role))err('MAPPING_ROLE_DENIED');
  if(note.length<15)err('REVIEW_NOTE_REQUIRED');
  const database=await db();await ensureSchema(database);
  const proposal=await first(database,'SELECT * FROM ICOFRMappingProposal WHERE id=? AND institutionId=? LIMIT 1',[id,institutionId]);
  if(!proposal) throw new Error('PROPOSAL_NOT_FOUND');
  const before=targetStatus(proposal);
  if(!stage.from.includes(before))err('INVALID_WORKFLOW_TRANSITION');
  const reviewerIds=[proposal.createdBy,proposal.ownerReviewedBy,proposal.icofrReviewedBy,proposal.approvedBy].filter(Boolean).map(String);
  if(action!=='REJECT'&&action!=='PUBLISH'&&reviewerIds.includes(actor.id))err('SEGREGATION_OF_DUTIES_REQUIRED');
  // The maker must not approve, and the same person cannot approve their own review.
  if(action==='PUBLISH'){
    if(!proposal.controlDomainId)err('PLC_MAPPING_REQUIRED');
    const control=await first(database,'SELECT category,sourceControlId FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
      [proposal.controlDomainId,institutionId]);
    if(!control||control.category!=='PLC'||control.sourceControlId!==proposal.controlMasterId)err('PLC_MAPPING_REQUIRED');
    const source=await first(database,`SELECT d.rawSha256 FROM SourceDocument d
      JOIN SourceStructuredRecord s ON s.sourceDocumentId=d.id AND s.institutionId=d.institutionId
      WHERE d.id=? AND d.institutionId=? AND s.recordKey=? LIMIT 1`,
      [proposal.sourceDocumentId,institutionId,proposal.sourceRecordKey]);
    if(!source||source.rawSha256!==proposal.sourceHash)err('SOURCE_VERSION_CHANGED');
    // No assertion is created until separate process owner, coordinator and reviewer sign-off.
    await saveTraceabilityChain({
      financialItemId:String(proposal.financialItemId),assertion:String(proposal.assertion),
      riskId:String(proposal.riskId),controlDomainId:String(proposal.controlDomainId),
      sourceControlId:String(proposal.controlMasterId),
      rationale:String(proposal.rationale)+' | Bukti: '+String(proposal.sourceRecordKey)+' / '+String(proposal.sourceReference)
    });
  }
  const field=action==='OWNER_REVIEW'?'ownerReviewedBy':action==='ICOFR_REVIEW'?'icofrReviewedBy':
    action==='APPROVE'?'approvedBy':action==='PUBLISH'?'publishedBy':null;
  const now=new Date().toISOString();
  const sql=`UPDATE ICOFRMappingProposal SET status=?,updatedAt=?,version=version+1`+
    (field?', '+field+'=?':'')+' WHERE id=? AND institutionId=? AND status=? AND version=?';
  const args:unknown[]=[stage.to,now,...(field?[actor.id]:[]),id,institutionId,before,proposal.version];
  const outcome=await run(database,sql,args);
  if(outcome?.meta?.changes!==1)err('CONCURRENT_REVIEW_CONFLICT');
  await logReview(database,institutionId,id,action,before,stage.to,actor,note);
  return {id,status:stage.to};
}
export async function getMappingReviewHistory(institutionId:string,proposalId:string){
  const database=await db();await ensureSchema(database);
  return all(database,'SELECT action,fromStatus,toStatus,actorRole,note,createdAt FROM ICOFRMappingReviewEvent WHERE institutionId=? AND proposalId=? ORDER BY createdAt',[institutionId,proposalId]);
}

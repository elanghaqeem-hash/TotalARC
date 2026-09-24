import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

export type ProcessFlowStep = {
  sourceActivityId: string;
  order: number;
  title: string;
  sourceTitle: string;
  performer: string | null;
  system: string | null;
  nature: string | null;
  kind: 'task' | 'decision';
  note: string | null;
};

export type ProcessFlowDefinition = {
  title: string;
  summary: string | null;
  processName: string;
  processCode: string;
  steps: ProcessFlowStep[];
};

export type ProcessFlowSource = {
  process: {
    id: string;
    institutionId: string;
    processId: string;
    name: string;
    description: string | null;
    ownerName: string | null;
  };
  activities: Array<{
    id: string;
    activityId: string;
    name: string;
    description: string | null;
    performer: string | null;
    nature: string | null;
    frequency: string | null;
    inputData: string | null;
    outputData: string | null;
    systemUsed: string | null;
    orderIndex: number;
  }>;
  sourceHash: string;
};

let processFlowSchemaReady: Promise<D1DatabaseLike> | null = null;

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

async function all<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results || [];
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).run() : statement.run();
}

async function ensureProcessFlowSchema() {
  if (processFlowSchemaReady) return processFlowSchemaReady;

  processFlowSchemaReady = (async () => {
    const db = await getDb();
    const statements = [
      `CREATE TABLE IF NOT EXISTS ProcessFlowDiagram (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        processId TEXT NOT NULL,
        versionNo INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        diagramJson TEXT NOT NULL,
        svgText TEXT NOT NULL,
        sourceHash TEXT NOT NULL,
        sourceType TEXT NOT NULL DEFAULT 'AI_GENERATED',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        isActive INTEGER NOT NULL DEFAULT 1,
        aiProvider TEXT,
        aiModel TEXT,
        aiRequestId TEXT,
        generatedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_process_flow_version
        ON ProcessFlowDiagram(institutionId, processId, versionNo)`,
      `CREATE INDEX IF NOT EXISTS idx_process_flow_active
        ON ProcessFlowDiagram(institutionId, processId, isActive, versionNo)`
    ];

    for (const statement of statements) {
      await db.prepare(statement).run();
    }

    return db;
  })().catch(error => {
    processFlowSchemaReady = null;
    throw error;
  });

  return processFlowSchemaReady;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(item => item.toString(16).padStart(2, '0'))
    .join('');
}

function sourcePayload(process: Record<string, unknown>, activities: Array<Record<string, unknown>>) {
  return JSON.stringify({
    process: {
      id: process.id,
      institutionId: process.institutionId,
      processId: process.processId,
      name: process.name,
      description: process.description || null,
      ownerName: process.ownerName || null
    },
    activities: activities.map(item => ({
      id: item.id,
      activityId: item.activityId,
      name: item.name,
      description: item.description || null,
      performer: item.performer || null,
      nature: item.nature || null,
      frequency: item.frequency || null,
      inputData: item.inputData || null,
      outputData: item.outputData || null,
      systemUsed: item.systemUsed || null,
      orderIndex: Number(item.orderIndex || 0)
    }))
  });
}

export async function getProcessFlowSource(
  processId: string,
  institutionId: string
): Promise<ProcessFlowSource> {
  const db = await ensureProcessFlowSchema();
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    [processId, institutionId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const activityRows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ProcessActivity WHERE processId = ? ORDER BY orderIndex ASC, createdAt ASC',
    [processId]
  );
  const payload = sourcePayload(process, activityRows);

  return {
    process: {
      id: String(process.id),
      institutionId: String(process.institutionId),
      processId: String(process.processId),
      name: String(process.name),
      description: text(process.description) || null,
      ownerName: text(process.ownerName) || null
    },
    activities: activityRows.map(item => ({
      id: String(item.id),
      activityId: String(item.activityId),
      name: String(item.name),
      description: text(item.description) || null,
      performer: text(item.performer) || null,
      nature: text(item.nature) || null,
      frequency: text(item.frequency) || null,
      inputData: text(item.inputData) || null,
      outputData: text(item.outputData) || null,
      systemUsed: text(item.systemUsed) || null,
      orderIndex: Number(item.orderIndex || 0)
    })),
    sourceHash: await sha256(payload)
  };
}

function parseDefinition(value: unknown): ProcessFlowDefinition | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value) as ProcessFlowDefinition;
  } catch {
    return null;
  }
}

function diagramRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    institutionId: String(row.institutionId),
    processId: String(row.processId),
    versionNo: Number(row.versionNo || 0),
    title: String(row.title || ''),
    summary: text(row.summary) || null,
    definition: parseDefinition(row.diagramJson),
    svgText: String(row.svgText || ''),
    sourceHash: String(row.sourceHash || ''),
    sourceType: String(row.sourceType || 'AI_GENERATED'),
    status: String(row.status || 'ACTIVE'),
    isActive: Number(row.isActive || 0) === 1,
    aiProvider: text(row.aiProvider) || null,
    aiModel: text(row.aiModel) || null,
    aiRequestId: text(row.aiRequestId) || null,
    generatedBy: text(row.generatedBy) || null,
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  };
}

export async function getProcessFlowWorkspace(processId: string, institutionId: string) {
  const db = await ensureProcessFlowSchema();
  const source = await getProcessFlowSource(processId, institutionId);
  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ProcessFlowDiagram
      WHERE institutionId = ? AND processId = ?
      ORDER BY versionNo DESC, createdAt DESC`,
    [institutionId, processId]
  );

  const history = rows.map(diagramRow);
  const active = history.find(item => item.isActive) || history[0] || null;

  return {
    process: source.process,
    activityCount: source.activities.length,
    currentSourceHash: source.sourceHash,
    diagram: active,
    history: history.map(item => ({
      id: item.id,
      versionNo: item.versionNo,
      title: item.title,
      status: item.status,
      isActive: item.isActive,
      sourceHash: item.sourceHash,
      aiProvider: item.aiProvider,
      aiModel: item.aiModel,
      generatedBy: item.generatedBy,
      createdAt: item.createdAt
    })),
    stale: Boolean(active && active.sourceHash !== source.sourceHash)
  };
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrap(value: string, max = 54) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? current + ' ' + word : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function tspanLines(lines: string[], x: number, startY: number, lineHeight: number, className: string) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${startY + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`
    )
    .join('');
}

function buildSvg(definition: ProcessFlowDefinition, versionNo: number) {
  const width = 1000;
  const cardX = 115;
  const cardWidth = 770;
  const startY = 190;
  const cardGap = 34;
  const stepLayouts = definition.steps.map(step => {
    const titleLines = wrap(step.title, 52);
    const performerLines = wrap(step.performer || 'Performer not provided', 70).slice(0, 2);
    const systemLine = step.system ? 'System: ' + step.system : 'System: Not provided';
    const noteLines = step.note ? wrap(step.note, 72).slice(0, 2) : [];
    const cardHeight =
      82 +
      titleLines.length * 28 +
      performerLines.length * 22 +
      (noteLines.length ? 12 + noteLines.length * 20 : 0);
    return { step, titleLines, performerLines, systemLine, noteLines, cardHeight };
  });

  let cursorY = startY;
  const cards: string[] = [];
  const arrows: string[] = [];

  for (let index = 0; index < stepLayouts.length; index += 1) {
    const layout = stepLayouts[index];
    const y = cursorY;
    const centerX = width / 2;
    const isDecision = layout.step.kind === 'decision';
    const border = isDecision ? '#f59e0b' : '#cbd5e1';
    const numberFill = isDecision ? '#fef3c7' : '#e0f2fe';
    const numberText = isDecision ? '#92400e' : '#075985';

    if (index > 0) {
      const previous = stepLayouts[index - 1];
      const previousTop =
        y - cardGap - previous.cardHeight;
      const fromY = previousTop + previous.cardHeight;
      arrows.push(
        `<line x1="${centerX}" y1="${fromY + 4}" x2="${centerX}" y2="${y - 10}" stroke="#94a3b8" stroke-width="3" marker-end="url(#arrow)" />`
      );
    }

    const titleY = y + 42;
    const performerY = titleY + layout.titleLines.length * 28 + 12;
    const systemY = performerY + layout.performerLines.length * 22 + 8;
    const noteY = systemY + 34;

    cards.push(`
      <g>
        <rect x="${cardX}" y="${y}" width="${cardWidth}" height="${layout.cardHeight}" rx="24"
          fill="#ffffff" stroke="${border}" stroke-width="${isDecision ? 3 : 2}" />
        <circle cx="${cardX + 48}" cy="${y + 48}" r="25" fill="${numberFill}" />
        <text x="${cardX + 48}" y="${y + 56}" text-anchor="middle" class="stepNo" fill="${numberText}">${layout.step.order}</text>
        ${tspanLines(layout.titleLines, cardX + 92, titleY, 28, 'title')}
        ${tspanLines(
          layout.performerLines.map((line, i) => (i === 0 ? 'Performer: ' + line : line)),
          cardX + 92,
          performerY,
          22,
          'meta'
        )}
        <text x="${cardX + 92}" y="${systemY}" class="meta">${escapeXml(layout.systemLine)}</text>
        ${layout.noteLines.length
          ? `<line x1="${cardX + 92}" y1="${noteY - 20}" x2="${cardX + cardWidth - 40}" y2="${noteY - 20}" stroke="#e2e8f0" stroke-width="1" />
             ${tspanLines(layout.noteLines, cardX + 92, noteY, 20, 'note')}`
          : ''}
        <rect x="${cardX + cardWidth - 170}" y="${y + 28}" width="130" height="32" rx="16" fill="${isDecision ? '#fffbeb' : '#f8fafc'}" />
        <text x="${cardX + cardWidth - 105}" y="${y + 49}" text-anchor="middle" class="kind">${isDecision ? 'DECISION' : escapeXml(layout.step.nature || 'TASK').toUpperCase()}</text>
      </g>`
    );

    cursorY += layout.cardHeight + cardGap;
  }

  const endY = cursorY + 8;
  const height = endY + 130;
  if (stepLayouts.length) {
    const last = stepLayouts[stepLayouts.length - 1];
    const lastTop = cursorY - cardGap - last.cardHeight;
    arrows.push(
      `<line x1="${width / 2}" y1="${lastTop + last.cardHeight + 4}" x2="${width / 2}" y2="${endY - 14}" stroke="#94a3b8" stroke-width="3" marker-end="url(#arrow)" />`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="flowTitle flowDesc">
  <title id="flowTitle">${escapeXml(definition.title)}</title>
  <desc id="flowDesc">Saved AI-generated process flow for ${escapeXml(definition.processName)}.</desc>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
    </marker>
    <style>
      .eyebrow { font: 700 18px Arial, Helvetica, sans-serif; fill: #64748b; letter-spacing: 1.5px; }
      .heading { font: 800 30px Arial, Helvetica, sans-serif; fill: #0f172a; }
      .subheading { font: 400 17px Arial, Helvetica, sans-serif; fill: #64748b; }
      .title { font: 700 22px Arial, Helvetica, sans-serif; fill: #0f172a; }
      .meta { font: 400 16px Arial, Helvetica, sans-serif; fill: #64748b; }
      .note { font: 500 15px Arial, Helvetica, sans-serif; fill: #475569; }
      .kind { font: 700 12px Arial, Helvetica, sans-serif; fill: #64748b; letter-spacing: 0.7px; }
      .stepNo { font: 800 17px Arial, Helvetica, sans-serif; }
      .startEnd { font: 800 15px Arial, Helvetica, sans-serif; fill: #ffffff; letter-spacing: 1px; }
      .version { font: 700 13px Arial, Helvetica, sans-serif; fill: #0369a1; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc" />
  <text x="70" y="58" class="eyebrow">TOTAL ARC · SAVED PROCESS FLOW</text>
  <text x="70" y="98" class="heading">${escapeXml(definition.title)}</text>
  <text x="70" y="130" class="subheading">${escapeXml(definition.processCode)} · ${escapeXml(definition.processName)}</text>
  <rect x="780" y="48" width="150" height="36" rx="18" fill="#e0f2fe" />
  <text x="855" y="71" text-anchor="middle" class="version">VERSION ${versionNo}</text>

  <rect x="410" y="150" width="180" height="48" rx="24" fill="#0284c7" />
  <text x="500" y="180" text-anchor="middle" class="startEnd">START</text>
  <line x1="500" y1="198" x2="500" y2="${startY - 10}" stroke="#94a3b8" stroke-width="3" marker-end="url(#arrow)" />

  ${arrows.join('')}
  ${cards.join('')}

  <rect x="410" y="${endY}" width="180" height="48" rx="24" fill="#0f172a" />
  <text x="500" y="${endY + 30}" text-anchor="middle" class="startEnd">END</text>

  <text x="70" y="${height - 34}" class="subheading">Generated from the saved Activity Register. AI output is a visual aid and does not change BPM source data.</text>
</svg>`;
}

async function audit(
  db: D1DatabaseLike,
  institutionId: string,
  actor: string,
  action: string,
  recordId: string,
  newValue: unknown,
  reason: string
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id, institutionId, userName, userRole, action, entityType, recordId,
      oldValue, newValue, reason, ipAddress, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`,
    [
      crypto.randomUUID(),
      institutionId,
      actor || 'System',
      'Process Flow',
      action,
      'ProcessFlowDiagram',
      recordId,
      JSON.stringify(newValue),
      reason,
      new Date().toISOString()
    ]
  );
}

export async function saveGeneratedProcessFlow(input: {
  institutionId: string;
  processId: string;
  sourceHash: string;
  definition: ProcessFlowDefinition;
  aiProvider: string;
  aiModel: string;
  aiRequestId: string;
  generatedBy: string;
}) {
  const db = await ensureProcessFlowSchema();
  const source = await getProcessFlowSource(input.processId, input.institutionId);
  if (source.sourceHash !== input.sourceHash) throw new Error('PROCESS_SOURCE_CHANGED');

  const next = await first<{ versionNo?: number }>(
    db,
    `SELECT COALESCE(MAX(versionNo), 0) + 1 AS versionNo
       FROM ProcessFlowDiagram
      WHERE institutionId = ? AND processId = ?`,
    [input.institutionId, input.processId]
  );
  const versionNo = Number(next?.versionNo || 1);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const svgText = buildSvg(input.definition, versionNo);

  await run(
    db,
    `INSERT INTO ProcessFlowDiagram (
      id, institutionId, processId, versionNo, title, summary, diagramJson, svgText,
      sourceHash, sourceType, status, isActive, aiProvider, aiModel, aiRequestId,
      generatedBy, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AI_GENERATED', 'ACTIVE', 0, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.institutionId,
      input.processId,
      versionNo,
      input.definition.title,
      input.definition.summary,
      JSON.stringify(input.definition),
      svgText,
      input.sourceHash,
      input.aiProvider,
      input.aiModel,
      input.aiRequestId,
      input.generatedBy,
      now,
      now
    ]
  );

  await run(
    db,
    'UPDATE ProcessFlowDiagram SET isActive = 0, updatedAt = ? WHERE institutionId = ? AND processId = ? AND id <> ?',
    [now, input.institutionId, input.processId, id]
  );
  await run(
    db,
    `UPDATE ProcessFlowDiagram
        SET isActive = 1, status = 'ACTIVE', updatedAt = ?
      WHERE id = ? AND institutionId = ? AND processId = ?`,
    [now, id, input.institutionId, input.processId]
  );

  const created = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ProcessFlowDiagram WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, input.institutionId]
  );
  if (!created) throw new Error('FLOW_SAVE_FAILED');

  await audit(
    db,
    input.institutionId,
    input.generatedBy,
    'AI_GENERATE',
    id,
    { processId: input.processId, versionNo, sourceHash: input.sourceHash },
    'AI-generated process flow saved for reuse; no source BPM data was modified.'
  );

  return diagramRow(created);
}

export async function activateProcessFlowDiagram(input: {
  institutionId: string;
  processId: string;
  diagramId: string;
  actor: string;
}) {
  const db = await ensureProcessFlowSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM ProcessFlowDiagram
      WHERE id = ? AND institutionId = ? AND processId = ?
      LIMIT 1`,
    [input.diagramId, input.institutionId, input.processId]
  );
  if (!existing) throw new Error('FLOW_NOT_FOUND');

  const now = new Date().toISOString();
  await run(
    db,
    'UPDATE ProcessFlowDiagram SET isActive = 0, updatedAt = ? WHERE institutionId = ? AND processId = ?',
    [now, input.institutionId, input.processId]
  );
  await run(
    db,
    `UPDATE ProcessFlowDiagram
        SET isActive = 1, status = 'ACTIVE', updatedAt = ?
      WHERE id = ? AND institutionId = ? AND processId = ?`,
    [now, input.diagramId, input.institutionId, input.processId]
  );

  await audit(
    db,
    input.institutionId,
    input.actor,
    'ACTIVATE',
    input.diagramId,
    { processId: input.processId, versionNo: Number(existing.versionNo || 0) },
    'Saved process-flow version selected as the active reusable diagram.'
  );

  return getProcessFlowWorkspace(input.processId, input.institutionId);
}

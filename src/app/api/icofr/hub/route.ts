import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureIcofrScopeSchema, getIcofrScopingData } from '@/lib/d1-icofr';
import {
  ensureIcofrDomainSchema,
  listDeficiencies,
  listFinancialItems,
  listIcofrControls,
  listInformationRegister
} from '@/lib/d1-icofr-domains';
import {
  ensureIcofrTraceabilitySchema,
  getTraceabilityData
} from '@/lib/d1-icofr-traceability';
import {
  ensureIcofrCoverageSchema,
  getIcofrCoverageData
} from '@/lib/d1-icofr-coverage';
import {
  ensureIcofrTestingPlanSchema,
  getTestingPlanData
} from '@/lib/d1-icofr-testing-plan';
import {
  ensureIcofrCertificationSchema,
  getCertificationData
} from '@/lib/d1-icofr-certification';
import {
  ensureIcofrExecutiveReportingSchema,
  getExecutiveReportingData
} from '@/lib/d1-icofr-executive-reporting';

export const dynamic = 'force-dynamic';

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

async function getDb(): Promise<D1DatabaseLike> {
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

async function count(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
) {
  const row = await first<{ count?: number }>(db, sql, values);
  return Number(row?.count || 0);
}

export async function GET(request: Request) {
  try {
    const view = new URL(request.url).searchParams.get('view');

    if (view === 'summary') {
      await ensureIcofrScopeSchema();
      await ensureIcofrDomainSchema();
      await ensureIcofrTestingPlanSchema();
      await ensureIcofrCertificationSchema();
      await ensureIcofrExecutiveReportingSchema();

      const db = await getDb();
      const institution = await first<Record<string, unknown>>(
        db,
        'SELECT id, name, legalName, shortName FROM Institution ORDER BY createdAt ASC LIMIT 1'
      );

      if (!institution) {
        return NextResponse.json({
          institution: null,
          latestScope: null,
          counts: {
            scopes: 0,
            financialItems: 0,
            significantFinancialItems: 0,
            controls: 0,
            keyControls: 0,
            elc: 0,
            plc: 0,
            itgc: 0,
            itac: 0,
            informationArtifacts: 0,
            deficiencies: 0,
            testingPlanItems: 0,
            attestations: 0,
            evidencePacks: 0,
            pbcRequests: 0
          },
          storage: 'cloudflare-d1',
          view: 'summary',
          progressive: true
        });
      }

      const institutionId = String(institution.id);
      const [
        latestScope,
        scopeCount,
        financialCount,
        significantFinancialCount,
        controlSummary,
        informationCount,
        deficiencyCount,
        testingPlanCount,
        attestationCount,
        evidencePackCount,
        pbcRequestCount
      ] = await Promise.all([
        first<Record<string, unknown>>(
          db,
          `SELECT *
             FROM ICOFRScope
            WHERE institutionId = ?
            ORDER BY fiscalYear DESC, updatedAt DESC
            LIMIT 1`,
          [institutionId]
        ),
        count(db, 'SELECT COUNT(*) AS count FROM ICOFRScope WHERE institutionId = ?', [institutionId]),
        count(db, 'SELECT COUNT(*) AS count FROM ICOFRFinancialItem WHERE institutionId = ?', [institutionId]),
        count(
          db,
          'SELECT COUNT(*) AS count FROM ICOFRFinancialItem WHERE institutionId = ? AND significant = 1',
          [institutionId]
        ),
        all<Record<string, unknown>>(
          db,
          `SELECT category,
                  COUNT(*) AS controls,
                  SUM(CASE WHEN keyControl = 1 THEN 1 ELSE 0 END) AS keyControls
             FROM ICOFRControlDomain
            WHERE institutionId = ?
            GROUP BY category`,
          [institutionId]
        ),
        count(db, 'SELECT COUNT(*) AS count FROM ICOFRInformationRegister WHERE institutionId = ?', [institutionId]),
        count(db, 'SELECT COUNT(*) AS count FROM ICOFRDeficiency WHERE institutionId = ?', [institutionId]),
        count(
          db,
          `SELECT COUNT(*) AS count
             FROM ICOFRTestingPlanItem p
             JOIN ICOFRTestingCycle c ON c.id = p.cycleId
            WHERE c.institutionId = ?`,
          [institutionId]
        ),
        count(db, 'SELECT COUNT(*) AS count FROM ICOFRManagementAttestation WHERE institutionId = ?', [institutionId]),
        count(db, 'SELECT COUNT(*) AS count FROM ICOFREvidencePack WHERE institutionId = ?', [institutionId]),
        count(db, 'SELECT COUNT(*) AS count FROM ICOFRPBCRequest WHERE institutionId = ?', [institutionId])
      ]);

      const categoryCounts = new Map(
        controlSummary.map(row => [
          String(row.category || '').toUpperCase(),
          {
            controls: Number(row.controls || 0),
            keyControls: Number(row.keyControls || 0)
          }
        ])
      );
      const categoryControlCount = (category: string) =>
        categoryCounts.get(category)?.controls || 0;
      const totalControls = controlSummary.reduce(
        (sum, row) => sum + Number(row.controls || 0),
        0
      );
      const totalKeyControls = controlSummary.reduce(
        (sum, row) => sum + Number(row.keyControls || 0),
        0
      );

      return NextResponse.json({
        institution,
        latestScope,
        counts: {
          scopes: scopeCount,
          financialItems: financialCount,
          significantFinancialItems: significantFinancialCount,
          controls: totalControls,
          keyControls: totalKeyControls,
          elc: categoryControlCount('ELC'),
          plc: categoryControlCount('PLC'),
          itgc: categoryControlCount('ITGC'),
          itac: categoryControlCount('ITAC'),
          informationArtifacts: informationCount,
          deficiencies: deficiencyCount,
          testingPlanItems: testingPlanCount,
          attestations: attestationCount,
          evidencePacks: evidencePackCount,
          pbcRequests: pbcRequestCount
        },
        storage: 'cloudflare-d1',
        view: 'summary',
        progressive: true
      });
    }

    if (view === 'metrics') {
      await ensureIcofrTraceabilitySchema();
      await ensureIcofrCoverageSchema();

      const [traceability, coverage] = await Promise.all([
        getTraceabilityData(),
        getIcofrCoverageData()
      ]);

      return NextResponse.json({
        traceabilityMetrics: traceability.metrics || {},
        coverageMetrics: coverage.metrics || {},
        storage: 'cloudflare-d1',
        view: 'metrics',
        progressive: true
      });
    }
    // Runtime DDL must complete deterministically before the hub fans out
    // into parallel read queries. Each ensure* call is memoized per Worker.
    await ensureIcofrScopeSchema();
    await ensureIcofrDomainSchema();
    await ensureIcofrTraceabilitySchema();
    await ensureIcofrCoverageSchema();
    await ensureIcofrTestingPlanSchema();
    await ensureIcofrCertificationSchema();
    await ensureIcofrExecutiveReportingSchema();

    const [
      scoping,
      financial,
      information,
      deficiencies,
      elc,
      plc,
      itgc,
      itac,
      traceability,
      coverage,
      testingPlan,
      certification,
      reporting
    ] = await Promise.all([
      getIcofrScopingData(),
      listFinancialItems(),
      listInformationRegister(),
      listDeficiencies(),
      listIcofrControls('ELC'),
      listIcofrControls('PLC'),
      listIcofrControls('ITGC'),
      listIcofrControls('ITAC'),
      getTraceabilityData(),
      getIcofrCoverageData(),
      getTestingPlanData(),
      getCertificationData(),
      getExecutiveReportingData()
    ]);

    const latestScope = scoping.scopes?.[0] || null;
    const controls = [
      ...(elc.records || []),
      ...(plc.records || []),
      ...(itgc.records || []),
      ...(itac.records || [])
    ];

    return NextResponse.json({
      institution:
        scoping.institution ||
        financial.institution ||
        certification.institution ||
        reporting.institution ||
        null,
      latestScope,
      counts: {
        scopes: scoping.scopes?.length || 0,
        financialItems: financial.records?.length || 0,
        significantFinancialItems:
          financial.records?.filter((item: any) => Boolean(item.significant)).length || 0,
        controls: controls.length,
        keyControls: controls.filter((control: any) => Boolean(control.keyControl)).length,
        elc: elc.records?.length || 0,
        plc: plc.records?.length || 0,
        itgc: itgc.records?.length || 0,
        itac: itac.records?.length || 0,
        informationArtifacts: information.records?.length || 0,
        deficiencies: deficiencies.records?.length || 0,
        testingPlanItems: testingPlan.planItems?.length || 0,
        attestations: certification.attestations?.length || 0,
        evidencePacks: certification.evidencePacks?.length || 0,
        pbcRequests: reporting.pbcRequests?.length || 0
      },
      traceabilityMetrics: traceability.metrics || {},
      coverageMetrics: coverage.metrics || {},
      testingMetrics: testingPlan.metrics || {},
      reportingMetrics: reporting.metrics || {},
      readiness: certification.readiness || {},
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load ICOFR hub integration data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR program data from persistent database.' },
      { status: 503 }
    );
  }
}

import { NextResponse } from 'next/server';
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

export async function GET() {
  try {
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

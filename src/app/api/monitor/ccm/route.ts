import { NextResponse } from 'next/server';
import {
  createMonitoringRule,
  ingestMonitoringRun,
  listMonitoringRules
} from '@/lib/d1-assurance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rules = await listMonitoringRules();
    return NextResponse.json({ rules, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 CCM rules:', error);
    return NextResponse.json({ error: 'Failed to fetch CCM rules from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : 'INGEST_RUN';

    if (actionType === 'CREATE_RULE') {
      const controlId = typeof body.controlId === 'string' ? body.controlId.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const dataSource = typeof body.dataSource === 'string' ? body.dataSource.trim() : '';
      const queryLogic = typeof body.queryLogic === 'string' ? body.queryLogic.trim() : '';

      if (!controlId || !name || !description || !dataSource || !queryLogic) {
        return NextResponse.json(
          { error: 'controlId, name, description, dataSource, and queryLogic are required.' },
          { status: 400 }
        );
      }

      const rule = await createMonitoringRule({ ...body, controlId, name, description, dataSource, queryLogic });
      return NextResponse.json(rule, { status: 201 });
    }

    const ruleId = typeof body.ruleId === 'string' ? body.ruleId.trim() : '';
    const populationChecked = Number(body.populationChecked);
    const exceptionsFound = Number(body.exceptionsFound);
    const details = typeof body.details === 'string' ? body.details.trim() : null;
    const exceptions = Array.isArray(body.exceptions)
      ? body.exceptions.filter(
          (item): item is { transactionRef?: string; details?: string } =>
            Boolean(item) && typeof item === 'object'
        )
      : [];

    if (
      !ruleId ||
      !Number.isInteger(populationChecked) || populationChecked < 0 ||
      !Number.isInteger(exceptionsFound) || exceptionsFound < 0
    ) {
      return NextResponse.json(
        { error: 'ruleId, populationChecked, and exceptionsFound from an actual monitoring execution are required.' },
        { status: 400 }
      );
    }

    if (exceptions.length > 0 && exceptionsFound !== exceptions.length) {
      return NextResponse.json(
        { error: 'exceptionsFound must match submitted exception records.' },
        { status: 400 }
      );
    }

    const run = await ingestMonitoringRun({
      ruleId,
      populationChecked,
      exceptionsFound,
      details,
      exceptions
    });

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CONTROL_NOT_FOUND') {
      return NextResponse.json({ error: 'Control not found.' }, { status: 404 });
    }
    if (code === 'RULE_NOT_FOUND') {
      return NextResponse.json({ error: 'Monitoring rule not found.' }, { status: 404 });
    }
    if (code === 'RULE_ID_CONFLICT') {
      return NextResponse.json({ error: 'Monitoring Rule ID already exists.' }, { status: 409 });
    }

    console.error('Failed to persist CCM action:', error);
    return NextResponse.json({ error: 'Failed to persist CCM data.' }, { status: 500 });
  }
}

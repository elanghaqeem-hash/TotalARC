import { NextResponse } from 'next/server';
import {
  createMonitoringRule,
  ingestMonitoringRun,
  listMonitoringRules
} from '@/lib/d1-assurance';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { listControls } from '@/lib/d1-core';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { recordMutationAudit } from '@/lib/d1-core';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [rules, authorizedOrgUnitIds] = await Promise.all([
      listMonitoringRules(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);
    const scopedRules = rules.filter(rule =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (((rule.control as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId) as string | null | undefined
      )
    );
    return NextResponse.json({ rules: scopedRules, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 CCM rules:', error);
    return NextResponse.json({ error: 'Failed to fetch CCM rules from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'ControlOwner']);
  if (auth.response) return auth.response;
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : 'INGEST_RUN';
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

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

      const controls = await listControls(auth.user.institutionId);
      const selectedControl = controls.find(control => control.id === controlId);
      if (
        selectedControl
        && !isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          (selectedControl.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
        )
      ) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected control organization unit.',
            code: 'CCM_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const rule = await createMonitoringRule({ ...body, controlId, name, description, dataSource, queryLogic }, auth.user.institutionId);
      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'MonitoringRule',
        recordId: String(rule?.id || rule?.ruleId || ''),
        newValue: {
          ruleId: rule?.ruleId,
          controlId: rule?.controlId,
          frequency: rule?.frequency,
          threshold: rule?.threshold,
          status: rule?.status
        },
        reason: 'Continuous monitoring rule created.'
      }, actor);
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

    const rules = await listMonitoringRules(auth.user.institutionId);
    const selectedRule = rules.find(rule => rule.id === ruleId);
    if (
      selectedRule
      && !isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (((selectedRule.control as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId) as string | null | undefined
      )
    ) {
      return NextResponse.json(
        {
          error: 'Your account is not authorized for this monitoring rule organization unit.',
          code: 'CCM_ORGANIZATION_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      );
    }

    const run = await ingestMonitoringRun({
      ruleId,
      populationChecked,
      exceptionsFound,
      details,
      exceptions
    }, auth.user.institutionId);

    await recordMutationAudit({
      institutionId: auth.user.institutionId,
      action: 'CREATE',
      entityType: 'MonitoringRun',
      recordId: String(run?.id || ''),
      newValue: {
        ruleId: run?.ruleId,
        populationChecked: run?.populationChecked,
        exceptionsFound: run?.exceptionsFound,
        status: run?.status,
        runTimestamp: run?.runTimestamp
      },
      reason: 'Continuous monitoring execution result ingested.'
    }, actor);

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

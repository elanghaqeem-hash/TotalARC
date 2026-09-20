import { NextResponse } from 'next/server';
import {
  createFinancialAccount,
  createIpeRegister,
  listIcofrData,
  upsertAccountAssertion
} from '@/lib/d1-assurance';
import { recordMutationAudit } from '@/lib/d1-core';
import { getOrganizationData } from '@/lib/d1-organization';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [data, authorizedOrgUnitIds] = await Promise.all([
      listIcofrData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    const financialAccounts = data.financialAccounts.filter(account =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (account as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );
    const ipeRegisters = data.ipeRegisters.filter(ipe =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (ipe as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );

    return NextResponse.json({
      financialAccounts,
      ipeRegisters,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to fetch ICOFR data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ICOFR data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(
    request,
    ['Admin', 'Reviewer', 'ProcessOwner', 'ControlOwner']
  );
  if (auth.response) return auth.response;

  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');
    const [authorizedOrgUnitIds, organization] = await Promise.all([
      resolveAuthorizedOrgUnitIds(auth.user),
      getOrganizationData(auth.user.institutionId)
    ]);

    if (actionType === 'CREATE_ACCOUNT' || actionType === 'CREATE_IPE') {
      const orgUnitId = textValue(body, 'orgUnitId') || null;
      const legalEntityId = textValue(body, 'legalEntityId') || null;
      const selectedUnit = orgUnitId
        ? organization.organizationUnits.find(unit => unit.id === orgUnitId)
        : null;

      if (!orgUnitId || !selectedUnit) {
        return NextResponse.json(
          { error: 'A valid organization unit is required for ICOFR records.' },
          { status: 400 }
        );
      }
      if (!isOrgUnitAuthorized(authorizedOrgUnitIds, orgUnitId)) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected ICOFR organization unit.',
            code: 'ICOFR_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }
      if (
        legalEntityId
        && selectedUnit.legalEntityId
        && selectedUnit.legalEntityId !== legalEntityId
      ) {
        return NextResponse.json(
          {
            error: 'The selected organization unit belongs to a different legal entity.',
            code: 'ICOFR_ORGANIZATION_ENTITY_MISMATCH'
          },
          { status: 409 }
        );
      }

      if (actionType === 'CREATE_ACCOUNT') {
        const accountCode = textValue(body, 'accountCode');
        const accountName = textValue(body, 'accountName');
        const financialStatement = textValue(body, 'financialStatement');
        const balanceAmount = Number(body.balanceAmount || 0);
        const fraudExposure = textValue(body, 'fraudExposure') || 'Not Assessed';
        const complexity = textValue(body, 'complexity') || 'Not Assessed';

        if (!accountCode || !accountName || !financialStatement || !Number.isFinite(balanceAmount)) {
          return NextResponse.json(
            {
              error: 'accountCode, accountName, financialStatement, and a numeric balanceAmount are required.'
            },
            { status: 400 }
          );
        }

        const rawAssertions = Array.isArray(body.assertions) ? body.assertions : [];
        const assertions = rawAssertions
          .filter(item => item && typeof item === 'object')
          .map(item => {
            const row = item as Record<string, unknown>;
            return {
              assertion: typeof row.assertion === 'string' ? row.assertion.trim() : '',
              isInScope: row.isInScope === true
            };
          })
          .filter(item => Boolean(item.assertion));

        const account = await createFinancialAccount({
          legalEntityId: legalEntityId || selectedUnit.legalEntityId || null,
          orgUnitId,
          accountCode,
          accountName,
          financialStatement,
          balanceAmount,
          isSignificant: body.isSignificant === true,
          scopingRationale: textValue(body, 'scopingRationale') || null,
          fraudExposure,
          complexity,
          assertions
        }, auth.user.institutionId);

        await recordMutationAudit({
          institutionId: auth.user.institutionId,
          action: 'CREATE',
          entityType: 'FinancialAccount',
          recordId: String(account?.id || ''),
          newValue: account,
          reason: 'ICOFR financial account scope record created.'
        }, actor);

        return NextResponse.json(account, { status: 201 });
      }

      const reportName = textValue(body, 'reportName');
      const systemSource = textValue(body, 'systemSource');
      const reportOwner = textValue(body, 'reportOwner');

      if (!reportName || !systemSource || !reportOwner) {
        return NextResponse.json(
          { error: 'reportName, systemSource, and reportOwner are required.' },
          { status: 400 }
        );
      }

      const ipe = await createIpeRegister({
        legalEntityId: legalEntityId || selectedUnit.legalEntityId || null,
        orgUnitId,
        reportName,
        systemSource,
        reportOwner,
        parameters: textValue(body, 'parameters') || null,
        logicSummary: textValue(body, 'logicSummary') || null,
        completenessTested: body.completenessTested === true,
        accuracyTested: body.accuracyTested === true,
        evidenceDoc: textValue(body, 'evidenceDoc') || null
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'IPERegister',
        recordId: String(ipe?.id || ''),
        newValue: ipe,
        reason: 'ICOFR IPE register record created.'
      }, actor);

      return NextResponse.json(ipe, { status: 201 });
    }

    if (actionType === 'UPSERT_ASSERTION') {
      const accountId = textValue(body, 'accountId');
      const assertion = textValue(body, 'assertion');

      if (!accountId || !assertion) {
        return NextResponse.json(
          { error: 'accountId and assertion are required.' },
          { status: 400 }
        );
      }

      const data = await listIcofrData(auth.user.institutionId);
      const account = data.financialAccounts.find(
        row => (row as Record<string, unknown>).id === accountId
      );

      if (
        !account
        || !isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          (account as Record<string, unknown>).orgUnitId as string | null | undefined
        )
      ) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for this financial account organization unit.',
            code: 'ICOFR_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: account ? 403 : 404 }
        );
      }

      const updated = await upsertAccountAssertion({
        accountId,
        assertion,
        isInScope: body.isInScope === true
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'UPDATE',
        entityType: 'AccountAssertionMapping',
        recordId: String(updated?.id || ''),
        newValue: updated,
        reason: 'ICOFR financial assertion scope updated.'
      }, actor);

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Unsupported ICOFR action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'FINANCIAL_ACCOUNT_NOT_FOUND') {
      return NextResponse.json({ error: 'Financial account not found.' }, { status: 404 });
    }
    if (code === 'FINANCIAL_ACCOUNT_CODE_CONFLICT') {
      return NextResponse.json({ error: 'Financial account code already exists.' }, { status: 409 });
    }

    console.error('Failed to persist ICOFR action:', error);
    return NextResponse.json(
      { error: 'Failed to persist ICOFR data.' },
      { status: 500 }
    );
  }
}

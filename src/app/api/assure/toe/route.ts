import { NextResponse } from 'next/server';
import {
  addToeSample,
  createTestingExceptionFromSample,
  createToeTest,
  updateToeSample
} from '@/lib/d1-assurance';
import {
  getControlScopeById,
  getToeSampleScopeById,
  getToeTestDetailPage,
  getToeTestScopeById,
  listToeRegisterPage
} from '@/lib/d1-register-pagination';
import { parsePaginationRequest } from '@/lib/pagination';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { recordMutationAudit } from '@/lib/d1-core';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'register';
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (mode === 'detail') {
      const toeTestId = (url.searchParams.get('testId') || '').trim();
      const sampleFilter = (url.searchParams.get('sampleFilter') || 'ALL').trim();

      if (!toeTestId) {
        return NextResponse.json(
          { error: 'testId is required for ToE workpaper detail.' },
          { status: 400 }
        );
      }
      if (!['ALL', 'PASS', 'FAIL'].includes(sampleFilter)) {
        return NextResponse.json(
          { error: 'sampleFilter must be ALL, PASS, or FAIL.' },
          { status: 400 }
        );
      }

      const scope = await getToeTestScopeById(
        auth.user.institutionId,
        toeTestId
      );
      if (!scope) {
        return NextResponse.json({ error: 'ToE test not found.' }, { status: 404 });
      }
      if (
        !isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          typeof scope.orgUnitId === 'string' ? scope.orgUnitId : null
        )
      ) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for this ToE test organization unit.',
            code: 'TOE_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const detail = await getToeTestDetailPage(
        auth.user.institutionId,
        toeTestId,
        parsePaginationRequest(request, 'sample'),
        sampleFilter as 'ALL' | 'PASS' | 'FAIL'
      );

      if (!detail) {
        return NextResponse.json({ error: 'ToE test not found.' }, { status: 404 });
      }

      return NextResponse.json({
        test: detail,
        storage: 'cloudflare-d1'
      }, {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      });
    }

    const pagination = parsePaginationRequest(request);
    const orgUnitId = (url.searchParams.get('orgUnitId') || '').trim() || null;
    const page = await listToeRegisterPage(
      auth.user.institutionId,
      {
        ...pagination,
        authorizedOrgUnitIds,
        orgUnitId
      }
    );

    return NextResponse.json({ ...page, storage: 'cloudflare-d1' }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    console.error('Failed to fetch D1 ToE tests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ToE tests from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'Tester', 'Reviewer']);
  if (auth.response) return auth.response;
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType =
      typeof body.actionType === 'string' ? body.actionType : 'UPDATE_SAMPLE';

    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    const isAuthorizedScope = (orgUnitId: unknown) =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        typeof orgUnitId === 'string' ? orgUnitId : null
      );

    if (actionType === 'CREATE_TEST') {
      const controlId = typeof body.controlId === 'string' ? body.controlId.trim() : '';
      const testerName = typeof body.testerName === 'string' ? body.testerName.trim() : '';
      const reviewerName =
        typeof body.reviewerName === 'string' ? body.reviewerName.trim() : null;
      const period = typeof body.period === 'string' ? body.period.trim() : '';
      const populationSource =
        typeof body.populationSource === 'string' ? body.populationSource.trim() : '';
      const samplingMethod =
        typeof body.samplingMethod === 'string' ? body.samplingMethod.trim() : '';
      const populationSize = Number(body.populationSize);

      if (
        !controlId ||
        !testerName ||
        !period ||
        !populationSource ||
        !samplingMethod ||
        !Number.isInteger(populationSize) ||
        populationSize < 0
      ) {
        return NextResponse.json(
          {
            error:
              'controlId, testerName, period, populationSource, samplingMethod, and a non-negative populationSize are required.'
          },
          { status: 400 }
        );
      }

      const selectedControl = await getControlScopeById(
        auth.user.institutionId,
        controlId
      );
      if (selectedControl && !isAuthorizedScope(selectedControl.orgUnitId)) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected control organization unit.',
            code: 'TOE_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const test = await createToeTest({
        testId: typeof body.testId === 'string' ? body.testId.trim() : undefined,
        controlId,
        testerName,
        reviewerName,
        period,
        populationSize,
        populationSource,
        samplingMethod,
        notes: typeof body.notes === 'string' ? body.notes.trim() : null
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'ToETest',
        recordId: String(test?.id || test?.testId || ''),
        newValue: test,
        reason: 'ToE test workpaper created.'
      }, actor);

      return NextResponse.json(test, { status: 201 });
    }

    if (actionType === 'CREATE_EXCEPTION') {
      const toeTestId =
        typeof body.toeTestId === 'string' ? body.toeTestId.trim() : '';
      const sampleId =
        typeof body.sampleId === 'string' ? body.sampleId.trim() : '';
      const severity =
        typeof body.severity === 'string' ? body.severity.trim() : 'High';
      const description =
        typeof body.description === 'string' ? body.description.trim() : null;

      if (!toeTestId || !sampleId) {
        return NextResponse.json(
          { error: 'toeTestId and sampleId are required.' },
          { status: 400 }
        );
      }

      const scopedTest = await getToeTestScopeById(
        auth.user.institutionId,
        toeTestId
      );
      if (scopedTest && !isAuthorizedScope(scopedTest.orgUnitId)) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for this ToE test organization unit.',
            code: 'TOE_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const exception = await createTestingExceptionFromSample({
        toeTestId,
        sampleId,
        severity,
        description
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'TestingException',
        recordId: String(exception?.id || exception?.exceptionNumber || ''),
        newValue: exception,
        reason: 'Testing exception created from a failed ToE sample.'
      }, actor);

      return NextResponse.json(exception, { status: 201 });
    }

    if (actionType === 'ADD_SAMPLE') {
      const toeTestId =
        typeof body.toeTestId === 'string' ? body.toeTestId.trim() : '';
      const transactionRef =
        typeof body.transactionRef === 'string' ? body.transactionRef.trim() : '';
      const transactionDate =
        typeof body.transactionDate === 'string' ? body.transactionDate.trim() : '';

      if (!toeTestId || !transactionRef || !transactionDate) {
        return NextResponse.json(
          { error: 'toeTestId, transactionRef, and transactionDate are required.' },
          { status: 400 }
        );
      }

      const amount =
        body.amount === null || body.amount === undefined || body.amount === ''
          ? null
          : Number(body.amount);
      if (amount !== null && !Number.isFinite(amount)) {
        return NextResponse.json({ error: 'amount must be numeric when provided.' }, { status: 400 });
      }

      const scopedTest = await getToeTestScopeById(
        auth.user.institutionId,
        toeTestId
      );
      if (scopedTest && !isAuthorizedScope(scopedTest.orgUnitId)) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for this ToE test organization unit.',
            code: 'TOE_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const sample = await addToeSample({
        toeTestId,
        transactionRef,
        transactionDate,
        amount,
        attributesTested:
          typeof body.attributesTested === 'string' ? body.attributesTested.trim() : null,
        evidenceRef:
          typeof body.evidenceRef === 'string' ? body.evidenceRef.trim() : null
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'ToESample',
        recordId: String(sample?.id || ''),
        newValue: sample,
        reason: 'ToE sample added to a persisted test workpaper.'
      }, actor);

      return NextResponse.json(sample, { status: 201 });
    }

    if (actionType !== 'UPDATE_SAMPLE') {
      return NextResponse.json({ error: 'Unsupported ToE action.' }, { status: 400 });
    }

    const sampleId = typeof body.sampleId === 'string' ? body.sampleId.trim() : '';
    const result = typeof body.result === 'string' ? body.result.trim() : '';
    const failureReason =
      typeof body.failureReason === 'string' ? body.failureReason.trim() : null;

    if (!sampleId || !result) {
      return NextResponse.json(
        { error: 'sampleId and result are required for a persisted ToE sample update.' },
        { status: 400 }
      );
    }

    const sampleScope = await getToeSampleScopeById(
      auth.user.institutionId,
      sampleId
    );
    if (sampleScope && !isAuthorizedScope(sampleScope.orgUnitId)) {
      return NextResponse.json(
        {
          error: 'Your account is not authorized for this ToE sample organization unit.',
          code: 'TOE_ORGANIZATION_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      );
    }

    const updated = await updateToeSample({ sampleId, result, failureReason }, auth.user.institutionId);
    await recordMutationAudit({
      institutionId: auth.user.institutionId,
      action: 'UPDATE',
      entityType: 'ToESample',
      recordId: String(updated?.id || sampleId),
      newValue: updated,
      reason: 'ToE sample result updated.'
    }, actor);

    return NextResponse.json(updated);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CONTROL_NOT_FOUND') {
      return NextResponse.json({ error: 'Control not found.' }, { status: 404 });
    }
    if (code === 'TOE_TEST_NOT_FOUND') {
      return NextResponse.json({ error: 'ToE test not found.' }, { status: 404 });
    }
    if (code === 'TOE_TEST_ID_CONFLICT') {
      return NextResponse.json({ error: 'ToE Test ID already exists.' }, { status: 409 });
    }
    if (code === 'SAMPLE_NOT_FOUND') {
      return NextResponse.json({ error: 'ToE sample not found.' }, { status: 404 });
    }
    if (code === 'SAMPLE_NOT_FAILED') {
      return NextResponse.json(
        { error: 'Only a persisted failed sample can be raised as a testing exception.' },
        { status: 409 }
      );
    }
    if (code === 'EXCEPTION_DESCRIPTION_REQUIRED') {
      return NextResponse.json(
        { error: 'An exception description is required.' },
        { status: 400 }
      );
    }
    if (code === 'EXCEPTION_ALREADY_EXISTS') {
      return NextResponse.json(
        { error: 'A testing exception already exists for this failed sample.' },
        { status: 409 }
      );
    }
    if (code === 'INVALID_SAMPLE_RESULT') {
      return NextResponse.json({ error: 'Invalid ToE sample result.' }, { status: 400 });
    }
    if (code === 'FAILURE_REASON_REQUIRED') {
      return NextResponse.json(
        { error: 'A factual failure reason is required when a sample result is Fail.' },
        { status: 400 }
      );
    }

    console.error('Failed to persist D1 ToE action:', error);
    return NextResponse.json(
      { error: 'Failed to persist ToE data in persistent database.' },
      { status: 500 }
    );
  }
}

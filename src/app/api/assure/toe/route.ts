import { NextResponse } from 'next/server';
import {
  addToeSample,
  createTestingExceptionFromSample,
  createToeTest,
  listToeTests,
  updateToeSample
} from '@/lib/d1-assurance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tests = await listToeTests();
    return NextResponse.json({ tests, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 ToE tests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ToE tests from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType =
      typeof body.actionType === 'string' ? body.actionType : 'UPDATE_SAMPLE';

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
      });

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

      const exception = await createTestingExceptionFromSample({
        toeTestId,
        sampleId,
        severity,
        description
      });

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

      const sample = await addToeSample({
        toeTestId,
        transactionRef,
        transactionDate,
        amount,
        attributesTested:
          typeof body.attributesTested === 'string' ? body.attributesTested.trim() : null,
        evidenceRef:
          typeof body.evidenceRef === 'string' ? body.evidenceRef.trim() : null
      });

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

    const updated = await updateToeSample({ sampleId, result, failureReason });
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
    if (code === 'PERIOD_CLOSED') {
      return NextResponse.json(
        { error: 'This ICOFR period is closed. ToE workpapers, samples and testing exceptions are frozen until an approved temporary reopening is active.' },
        { status: 409 }
      );
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

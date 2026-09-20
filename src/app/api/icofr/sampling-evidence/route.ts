import { NextResponse } from 'next/server';
import {
  approveSamplingPlan,
  completeSamplingPlan,
  getSamplingEvidenceData,
  recordLinkedSampleResult,
  removeSamplingCandidate,
  saveEvidenceRequest,
  saveSamplingCandidate,
  saveSamplingPlan,
  selectSamplingCandidates,
  setManualCandidateSelection,
  syncSelectedSamplesToToe,
  updateCandidateEvidence,
  updateEvidenceRequest
} from '@/lib/d1-icofr-sampling-evidence';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getSamplingEvidenceData();
    return NextResponse.json(
      { ...data, storage: 'cloudflare-d1' },
      { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=45' } }
    );
  } catch (error) {
    console.error('Failed to load ICOFR sampling/evidence data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR sampling and evidence data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_PLAN') {
      const record = await saveSamplingPlan(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }
    if (actionType === 'SAVE_CANDIDATE') {
      const record = await saveSamplingCandidate(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }
    if (actionType === 'REMOVE_CANDIDATE') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) return NextResponse.json({ error: 'Candidate ID is required.' }, { status: 400 });
      return NextResponse.json(await removeSamplingCandidate(id));
    }
    if (actionType === 'SET_MANUAL_SELECTION') {
      return NextResponse.json(await setManualCandidateSelection(body));
    }
    if (actionType === 'APPROVE_PLAN') {
      return NextResponse.json(await approveSamplingPlan(body));
    }
    if (actionType === 'SELECT_SAMPLES') {
      return NextResponse.json(await selectSamplingCandidates(body));
    }
    if (actionType === 'CREATE_EVIDENCE_REQUEST') {
      return NextResponse.json(await saveEvidenceRequest(body), { status: 201 });
    }
    if (actionType === 'UPDATE_EVIDENCE') {
      return NextResponse.json(await updateCandidateEvidence(body));
    }
    if (actionType === 'UPDATE_EVIDENCE_REQUEST') {
      return NextResponse.json(await updateEvidenceRequest(body));
    }
    if (actionType === 'SYNC_TO_TOE') {
      return NextResponse.json(await syncSelectedSamplesToToe(body));
    }
    if (actionType === 'RECORD_SAMPLE_RESULT') {
      return NextResponse.json(await recordLinkedSampleResult(body));
    }
    if (actionType === 'COMPLETE_PLAN') {
      return NextResponse.json(await completeSamplingPlan(body));
    }

    return NextResponse.json({ error: 'Unsupported ICOFR sampling/evidence action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using ICOFR sampling and evidence management.', 409],
      SAMPLING_PLAN_REQUIRED: ['Testing-plan item, preparer and a valid sampling method are required.', 400],
      PLAN_ITEM_NOT_FOUND: ['Selected ICOFR Testing Plan item was not found.', 404],
      TOE_NOT_LAUNCHED: ['Launch ToE from the Testing Plan before creating an integrated sampling plan.', 409],
      PERIOD_CLOSED: ['This ICOFR period is closed. Request an approved temporary reopening before changing sampling or evidence records.', 409],
      POPULATION_REQUIRED: ['A positive population size and population source are required in the launched ToE.', 400],
      INVALID_TARGET_SAMPLE: ['Target sample size must be a positive whole number and cannot exceed the population.', 400],
      SAMPLE_OVERRIDE_RATIONALE_REQUIRED: ['Document a rationale when target sample size differs from the system planning recommendation.', 400],
      SAMPLING_PLAN_LOCKED: ['This sampling plan has progressed beyond Draft and cannot be edited through this action.', 409],
      SAMPLING_PLAN_CONFLICT: ['A sampling plan already exists for the selected Testing Plan item.', 409],
      CANDIDATE_REQUIRED: ['Sampling plan, transaction reference and transaction date are required.', 400],
      SAMPLING_PLAN_NOT_FOUND: ['Sampling plan was not found.', 404],
      CANDIDATE_SYNCED: ['A candidate already linked to a ToE sample cannot have its source identity changed.', 409],
      CANDIDATE_CONFLICT: ['The transaction/reference is already registered in this sampling population.', 409],
      CANDIDATE_NOT_FOUND: ['Sampling candidate was not found.', 404],
      CANDIDATE_LOCKED: ['Selected or ToE-linked candidates cannot be deleted.', 409],
      SAMPLING_POPULATION_LOCKED: ['The sampling population is frozen after plan approval. Rework the plan before approval instead of changing the approved population.', 409],
      MANUAL_SELECTION_METHOD_REQUIRED: ['Manual selection is available only when the plan uses Manual / Judgmental selection.', 409],
      MANUAL_SELECTION_REASON_REQUIRED: ['Document the judgmental selection reason before selecting this candidate.', 400],
      SAMPLING_APPROVAL_REQUIRED: ['Independent reviewer, population completeness confirmation and completeness basis are required.', 400],
      SAMPLING_SELF_REVIEW: ['The sampling-plan preparer cannot perform the independent approval.', 409],
      INSUFFICIENT_CANDIDATES: ['Register enough population candidates to support the approved target sample size.', 409],
      MANUAL_SELECTION_COUNT: ['Manual / Judgmental selection must contain exactly the approved target number of samples.', 409],
      SAMPLING_NOT_APPROVED: ['Approve the sampling plan before executing sample selection.', 409],
      EVIDENCE_REQUEST_REQUIRED: ['Sampling plan, request number, description, owner, request date and due date are required.', 400],
      INVALID_EVIDENCE_REQUEST_TYPE: ['Evidence request type must be Internal Evidence Request or External Audit PBC.', 400],
      INVALID_EVIDENCE_REQUEST_DATES: ['Evidence request due date cannot be earlier than request date.', 400],
      EVIDENCE_REQUEST_CONFLICT: ['Evidence request number already exists.', 409],
      EVIDENCE_REQUEST_UPDATE_REQUIRED: ['Evidence request ID and a valid lifecycle status are required.', 400],
      EVIDENCE_REQUEST_REFERENCE_REQUIRED: ['Evidence reference is required for Submitted, Accepted or Closed evidence requests.', 400],
      EVIDENCE_REQUEST_NOT_FOUND: ['Evidence request was not found.', 404],
      AUDITOR_REQUIRED: ['Auditor name is required for an External Audit PBC request.', 400],
      EVIDENCE_UPDATE_REQUIRED: ['Candidate, valid evidence status and valid evidence-review decision are required.', 400],
      EVIDENCE_REFERENCE_REQUIRED: ['Evidence reference is required when evidence has been received or assessed.', 400],
      EVIDENCE_REVIEWER_REQUIRED: ['Evidence reviewer is required for Accepted or Rejected evidence.', 400],
      EVIDENCE_REJECTION_NOTES_REQUIRED: ['Reviewer notes are required when evidence is rejected.', 400],
      EVIDENCE_SELECTED_SAMPLE_REQUIRED: ['Evidence review is available only for selected sampling candidates.', 409],
      EVIDENCE_SELF_REVIEW: ['The evidence owner cannot approve or reject their own evidence.', 409],
      SAMPLES_NOT_SELECTED: ['Execute sample selection before syncing samples to ToE.', 409],
      SELECTED_SAMPLE_COUNT_MISMATCH: ['Selected sample count does not match the approved target sample size.', 409],
      SAMPLE_RESULT_REQUIRED: ['Linked candidate and valid ToE sample result are required.', 400],
      FAILURE_REASON_REQUIRED: ['A factual failure reason is required for a failed sample.', 400],
      TOE_SAMPLE_NOT_LINKED: ['Sync the selected candidate to ToE before recording test results.', 409],
      EXCEPTION_ALREADY_EXISTS: ['A testing exception already exists for this failed sample.', 409],
      SAMPLING_COMPLETE_REQUIRED: ['Sampling plan and completed-by name are required.', 400],
      SAMPLING_NOT_IN_PROGRESS: ['Sampling plan must be In Progress before completion.', 409],
      EVIDENCE_REVIEW_PENDING: ['All selected samples require Complete evidence with Accepted reviewer sign-off before completion.', 409],
      SAMPLE_TESTING_PENDING: ['All selected ToE samples must have a recorded result before the sampling plan can be completed.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to process ICOFR sampling/evidence action:', error);
    return NextResponse.json(
      { error: 'Failed to process ICOFR sampling/evidence action.' },
      { status: 500 }
    );
  }
}

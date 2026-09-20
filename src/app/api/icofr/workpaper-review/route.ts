import { NextResponse } from 'next/server';
import {
  clearWorkpaperReviewNote,
  createWorkpaperReviewNote,
  decideWorkpaperReview,
  getWorkpaperReviewData,
  removeWorkpaperEvidence,
  respondWorkpaperReviewNote,
  reviewWorkpaperEvidence,
  saveWorkpaperEvidence,
  saveWorkpaperReview,
  submitWorkpaperReview
} from '@/lib/d1-icofr-workpaper-review';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getWorkpaperReviewData();
    return NextResponse.json(
      { ...data, storage: 'cloudflare-d1' },
      { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=45' } }
    );
  } catch (error) {
    console.error('Failed to load ICOFR workpaper review data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR workpaper review and quality-gate data.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_REVIEW') {
      const record = await saveWorkpaperReview(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }
    if (actionType === 'SAVE_EVIDENCE') {
      const record = await saveWorkpaperEvidence(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }
    if (actionType === 'REVIEW_EVIDENCE') {
      return NextResponse.json(await reviewWorkpaperEvidence(body));
    }
    if (actionType === 'REMOVE_EVIDENCE') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) return NextResponse.json({ error: 'Evidence ID is required.' }, { status: 400 });
      return NextResponse.json(await removeWorkpaperEvidence(id));
    }
    if (actionType === 'CREATE_REVIEW_NOTE') {
      return NextResponse.json(await createWorkpaperReviewNote(body), { status: 201 });
    }
    if (actionType === 'RESPOND_REVIEW_NOTE') {
      return NextResponse.json(await respondWorkpaperReviewNote(body));
    }
    if (actionType === 'CLEAR_REVIEW_NOTE') {
      return NextResponse.json(await clearWorkpaperReviewNote(body));
    }
    if (actionType === 'SUBMIT_REVIEW') {
      const reviewId = typeof body.reviewId === 'string' ? body.reviewId.trim() : '';
      if (!reviewId) return NextResponse.json({ error: 'Review ID is required.' }, { status: 400 });
      return NextResponse.json(await submitWorkpaperReview(reviewId));
    }
    if (actionType === 'DECIDE_REVIEW') {
      return NextResponse.json(await decideWorkpaperReview(body));
    }

    return NextResponse.json({ error: 'Unsupported ICOFR workpaper-review action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using workpaper review.', 409],
      INVALID_WORKPAPER_TYPE: ['Workpaper type must be ToD or ToE.', 400],
      REVIEW_REQUIRED: ['Workpaper, workpaper type and preparer are required.', 400],
      INVALID_CONCLUSION: ['Conclusion must be Not Assessed, Effective, Partially Effective, or Ineffective.', 400],
      WORKPAPER_NOT_FOUND: ['Selected ToD/ToE workpaper was not found for this institution.', 404],
      PERIOD_CLOSED: ['This ICOFR period is closed. Workpaper review is frozen until an approved temporary reopening is active.', 409],
      REVIEW_LOCKED: ['Approved workpaper review is locked.', 409],
      REVIEW_CONFLICT: ['A review already exists for the selected workpaper.', 409],
      SELF_REVIEW: ['Preparer and reviewer must be different people.', 409],
      EVIDENCE_REQUIRED: ['Review, evidence reference, evidence type, description and owner are required.', 400],
      REVIEW_NOT_FOUND: ['Workpaper review was not found.', 404],
      EVIDENCE_CONFLICT: ['Evidence reference already exists in this workpaper evidence index.', 409],
      EVIDENCE_REVIEW_REQUIRED: ['Evidence, assigned reviewer and valid reviewer decision are required.', 400],
      EVIDENCE_REJECTION_NOTES_REQUIRED: ['Reviewer notes are required when evidence is rejected.', 400],
      EVIDENCE_NOT_FOUND: ['Evidence index record was not found.', 404],
      EVIDENCE_SELF_REVIEW: ['Evidence owner cannot independently approve or reject their own evidence.', 409],
      UNASSIGNED_REVIEWER: ['This action must be performed by the reviewer assigned to the workpaper.', 409],
      REVIEW_NOTE_REQUIRED: ['Review, title, description, reviewer and note owner are required.', 400],
      INVALID_NOTE_SEVERITY: ['Review-note severity must be Critical, High, Medium, or Low.', 400],
      REVIEW_NOTE_RESPONSE_REQUIRED: ['Review note, response and response-by name are required.', 400],
      REVIEW_NOTE_NOT_FOUND: ['Review note was not found.', 404],
      REVIEW_NOTE_CLOSED: ['Cleared/waived review notes cannot be responded to.', 409],
      REVIEW_NOTE_OWNER_REQUIRED: ['The assigned review-note owner must record the response.', 409],
      REVIEW_NOTE_CLEARANCE_REQUIRED: ['Review note, reviewer, clearance decision and clearance comment are required.', 400],
      REVIEW_NOTE_NOT_RESPONDED: ['A review note must be responded to before it can be cleared or waived.', 409],
      REVIEW_NOTE_SELF_CLEARANCE: ['Review-note owner cannot clear or waive their own review point.', 409],
      CHECKLIST_INCOMPLETE: ['Complete all workpaper-preparation checklist items before submission.', 409],
      PREPARER_CONCLUSION_REQUIRED: ['Record the preparer conclusion before submission.', 409],
      REVIEWER_REQUIRED: ['Assign an independent reviewer before submission.', 409],
      EVIDENCE_INDEX_REQUIRED: ['At least one workpaper evidence-index record is required before submission.', 409],
      REVIEW_DECISION_REQUIRED: ['Review ID, assigned reviewer and Approve/Return decision are required.', 400],
      REVIEW_NOT_SUBMITTED: ['Submit the workpaper for review before recording a reviewer decision.', 409],
      RETURN_COMMENTS_REQUIRED: ['Reviewer comments are required when returning a workpaper.', 400],
      REVIEWER_CONCLUSION_REQUIRED: ['A reviewer conclusion is required for approval.', 400],
      QUALITY_GATE_NOT_MET: ['Workpaper quality gates are not fully met. Resolve evidence/review-note/testing gaps before approval.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to process ICOFR workpaper-review action:', error);
    return NextResponse.json(
      { error: 'Failed to process ICOFR workpaper-review action.' },
      { status: 500 }
    );
  }
}

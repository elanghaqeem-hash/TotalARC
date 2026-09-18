import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'AI analysis provider is not configured.',
      findings: [],
      disclaimer: 'Total ARC does not generate simulated findings. Configure an approved AI provider and submit persisted process/risk/control context before enabling analysis.'
    },
    { status: 503 }
  );
}

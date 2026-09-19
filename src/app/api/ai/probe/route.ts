import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';

export const dynamic = 'force-dynamic';

async function tokenMatches(provided: string | null, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const prefix = 'Bearer ';
  if (!provided.startsWith(prefix)) return false;

  const candidate = provided.slice(prefix.length);
  const encoder = new TextEncoder();
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);

  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(expectedHash);
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  const expectedToken = process.env.AI_PROBE_TOKEN || '';
  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: 'AI production probe is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const authorized = await tokenMatches(request.headers.get('authorization'), expectedToken);
  if (!authorized) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  try {
    const result = await runAiGateway({
      task: 'classification',
      sensitivity: 'confidential',
      systemPrompt: 'You are a production connectivity probe for Total ARC. Return a short acknowledgement only.',
      prompt: 'Confirm that the private Total ARC AI provider can perform inference.',
      temperature: 0,
      maxOutputTokens: 64
    });

    return NextResponse.json(
      {
        ok: true,
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        durationMs: result.durationMs
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('AI production probe failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Private AI inference failed.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

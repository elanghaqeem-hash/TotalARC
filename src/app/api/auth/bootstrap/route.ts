import { NextResponse } from 'next/server';
import { bootstrapFirstAdmin } from '@/lib/d1-auth';
import { requestMetadata } from '@/lib/auth-request';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const meta = requestMetadata(request);
    const user = await bootstrapFirstAdmin({
      bootstrapToken: String(body.bootstrapToken || ''),
      institutionId: String(body.institutionId || ''),
      email: String(body.email || ''),
      name: String(body.name || ''),
      password: String(body.password || ''),
      ...meta
    });
    return NextResponse.json(
      {
        user,
        message: 'First platform SuperAdmin created. Sign in with the password you supplied; no plaintext credential is stored.'
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      BOOTSTRAP_NOT_CONFIGURED: ['AUTH_BOOTSTRAP_TOKEN must be configured as a Cloudflare secret before first-admin setup.', 503],
      BOOTSTRAP_DENIED: ['The bootstrap token is invalid.', 403],
      BOOTSTRAP_CLOSED: ['Bootstrap is closed because at least one user already exists.', 409],
      INSTITUTION_NOT_FOUND: ['Select a registered institution.', 404],
      USER_REQUIRED: ['Administrator name and a valid email address are required.', 400],
      PASSWORD_POLICY: ['Password must be 12–128 characters and include upper/lowercase letters, a number and a symbol; common/default passwords are rejected.', 400]
    };
    if (known[code]) return NextResponse.json({ error: known[code][0], code }, { status: known[code][1] });
    console.error('First-admin bootstrap failed:', error);
    return NextResponse.json({ error: 'First platform SuperAdmin could not be created.' }, { status: 500 });
  }
}

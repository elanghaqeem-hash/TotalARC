import { NextResponse } from 'next/server';
import { bootstrapFirstAdmin, sameOrigin } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    }
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 32_768) {
      return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const bootstrapToken =
      typeof body.bootstrapToken === 'string' ? body.bootstrapToken : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!bootstrapToken || !name || !email || !password) {
      return NextResponse.json(
        { error: 'bootstrapToken, name, email, and password are required.' },
        { status: 400 }
      );
    }

    const user = await bootstrapFirstAdmin({ bootstrapToken, name, email, password });
    return NextResponse.json(
      {
        user,
        message: 'Initial administrator created. Sign in before enabling AUTH_ENFORCE.'
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'BOOTSTRAP_FORBIDDEN') {
      return NextResponse.json({ error: 'Invalid bootstrap token.' }, { status: 403 });
    }
    if (code === 'BOOTSTRAP_CLOSED') {
      return NextResponse.json(
        { error: 'Bootstrap is closed because at least one user already exists.' },
        { status: 409 }
      );
    }
    if (code === 'INSTITUTION_REQUIRED') {
      return NextResponse.json(
        { error: 'Register the institution before creating the first administrator.' },
        { status: 409 }
      );
    }
    if (code === 'PASSWORD_POLICY') {
      return NextResponse.json(
        {
          error:
            'Password must be at least 12 characters and contain upper-case, lower-case, numeric, and special characters.'
        },
        { status: 400 }
      );
    }

    console.error('Failed to bootstrap administrator:', error);
    return NextResponse.json({ error: 'Unable to bootstrap administrator.' }, { status: 500 });
  }
}

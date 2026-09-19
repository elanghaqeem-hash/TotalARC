import { NextResponse } from 'next/server';
import {
  USER_ROLES,
  authorizationErrorPayload,
  requireRoles,
  type AuthenticatedUser,
  type UserRole
} from '@/lib/auth';

export const READ_ROLES = USER_ROLES;

type AuthorizedResult =
  | { user: AuthenticatedUser; response: null }
  | { user: null; response: NextResponse };

export async function authorizeApi(
  request: Request,
  roles: readonly UserRole[]
): Promise<AuthorizedResult> {
  try {
    const user = await requireRoles(request, roles);
    return { user, response: null };
  } catch (error) {
    const failure = authorizationErrorPayload(error);
    if (failure) {
      return {
        user: null,
        response: NextResponse.json(failure.body, {
          status: failure.status,
          headers: {
            'Cache-Control': 'no-store, max-age=0'
          }
        })
      };
    }
    throw error;
  }
}

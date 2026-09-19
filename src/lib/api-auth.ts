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

export type TenantAuthenticatedUser = AuthenticatedUser & { institutionId: string };

type TenantAuthorizedResult =
  | { user: TenantAuthenticatedUser; response: null }
  | { user: null; response: NextResponse };

export async function authorizeTenantApi(
  request: Request,
  roles: readonly UserRole[]
): Promise<TenantAuthorizedResult> {
  const authorized = await authorizeApi(request, roles);
  if (authorized.response || !authorized.user) {
    return { user: null, response: authorized.response };
  }

  if (!authorized.user.institutionId) {
    return {
      user: null,
      response: NextResponse.json(
        {
          error: 'Register and bind an institution before using operational modules.',
          code: 'INSTITUTION_CONTEXT_REQUIRED'
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store, max-age=0'
          }
        }
      )
    };
  }

  return {
    user: authorized.user as TenantAuthenticatedUser,
    response: null
  };
}

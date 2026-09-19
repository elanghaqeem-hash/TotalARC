import { NextResponse } from 'next/server';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';
import {
  createLegalEntity,
  createOrganizationPosition,
  createOrganizationUnit,
  getOrganizationData,
  importOrganizationUnits,
  updateLegalEntity,
  updateOrganizationPosition,
  updateOrganizationUnit
} from '@/lib/d1-organization';

export const dynamic = 'force-dynamic';

function statusForError(code: string) {
  if (code.includes('NOT_FOUND')) return 404;
  if (
    code.includes('CONFLICT')
    || code.includes('CYCLE')
    || code.includes('MISMATCH')
  ) return 409;
  if (
    code.includes('REQUIRED')
    || code.includes('INVALID')
    || code.includes('EMPTY')
    || code.includes('TOO_LARGE')
  ) return 400;
  if (code.includes('UNAVAILABLE')) return 503;
  return 500;
}

function publicMessage(code: string) {
  const messages: Record<string, string> = {
    LEGAL_ENTITY_CODE_REQUIRED: 'Legal entity code is required.',
    LEGAL_ENTITY_NAME_REQUIRED: 'Legal entity name is required.',
    LEGAL_ENTITY_CODE_CONFLICT: 'That legal entity code is already in use.',
    LEGAL_ENTITY_NOT_FOUND: 'The selected legal entity was not found.',
    LEGAL_ENTITY_HIERARCHY_CYCLE: 'The selected legal entity parent would create a hierarchy cycle.',
    ORGANIZATION_UNIT_CODE_REQUIRED: 'Organization unit code is required.',
    ORGANIZATION_UNIT_NAME_REQUIRED: 'Organization unit name is required.',
    ORGANIZATION_UNIT_TYPE_REQUIRED: 'Organization unit type is required.',
    ORGANIZATION_UNIT_TYPE_INVALID: 'Organization unit type is not valid.',
    ORGANIZATION_UNIT_CODE_CONFLICT: 'That organization unit code is already in use.',
    ORGANIZATION_UNIT_NOT_FOUND: 'The selected organization unit was not found.',
    ORGANIZATION_UNIT_HIERARCHY_CYCLE: 'The selected parent would create a hierarchy cycle.',
    ORGANIZATION_UNIT_ENTITY_MISMATCH: 'Parent and child units must belong to the same legal entity.',
    ORGANIZATION_POSITION_UNIT_REQUIRED: 'An organization unit is required for the position.',
    ORGANIZATION_POSITION_CODE_REQUIRED: 'Position code is required.',
    ORGANIZATION_POSITION_TITLE_REQUIRED: 'Position title is required.',
    ORGANIZATION_POSITION_CODE_CONFLICT: 'That position code is already in use.',
    ORGANIZATION_POSITION_NOT_FOUND: 'The selected position was not found.',
    ORGANIZATION_USER_NOT_FOUND: 'The selected user is not available in this institution.',
    ORGANIZATION_STATUS_INVALID: 'Status must be Active or Inactive.',
    ORGANIZATION_IMPORT_EMPTY: 'The import file does not contain any organization rows.',
    ORGANIZATION_IMPORT_TOO_LARGE: 'A single import is limited to 500 organization rows.',
    ORGANIZATION_IMPORT_CODE_REQUIRED: 'Every imported row must have a unitCode.',
    ORGANIZATION_IMPORT_NAME_REQUIRED: 'Every imported row must have a unitName.',
    ORGANIZATION_IMPORT_DUPLICATE_CODE: 'The import contains a duplicate organization unit code.',
    ORGANIZATION_IMPORT_CODE_CONFLICT: 'The import contains a code already used by an existing organization unit.',
    ORGANIZATION_IMPORT_ENTITY_NOT_FOUND: 'An imported legal entity code does not exist.',
    ORGANIZATION_IMPORT_PARENT_NOT_FOUND: 'An imported parent unit code does not exist.',
    ORGANIZATION_IMPORT_HIERARCHY_CYCLE: 'The imported hierarchy contains a parent-child cycle.',
    ORGANIZATION_IMPORT_ENTITY_MISMATCH: 'Imported parent and child units resolve to different legal entities.',
    ORGANIZATION_DATABASE_UNAVAILABLE: 'The persistent organization database is not available.',
    INSTITUTION_NOT_FOUND: 'The institution record was not found.'
  };

  return messages[code] || 'The organization request could not be completed.';
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'ORGANIZATION_OPERATION_FAILED';
  const status = statusForError(code);

  if (status >= 500) {
    console.error('Organization operation failed:', error);
  }

  return NextResponse.json(
    {
      error: publicMessage(code),
      code
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    }
  );
}

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const data = await getOrganizationData(auth.user.institutionId);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;

  const auth = await authorizeTenantApi(request, ['Admin']);
  if (auth.response) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const actor = mutationActorFromRequest(request, auth.user);

    if (action === 'create-legal-entity') {
      const record = await createLegalEntity(auth.user.institutionId, body, actor);
      return NextResponse.json({ record }, { status: 201 });
    }

    if (action === 'create-unit') {
      const record = await createOrganizationUnit(auth.user.institutionId, body, actor);
      return NextResponse.json({ record }, { status: 201 });
    }

    if (action === 'create-position') {
      const record = await createOrganizationPosition(auth.user.institutionId, body, actor);
      return NextResponse.json({ record }, { status: 201 });
    }

    if (action === 'import-units') {
      const result = await importOrganizationUnits(auth.user.institutionId, body.rows, actor);
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json(
      {
        error: 'Unsupported organization action.',
        code: 'ORGANIZATION_ACTION_INVALID'
      },
      { status: 400 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;

  const auth = await authorizeTenantApi(request, ['Admin']);
  if (auth.response) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const actor = mutationActorFromRequest(request, auth.user);

    if (action === 'update-legal-entity') {
      const record = await updateLegalEntity(auth.user.institutionId, body, actor);
      return NextResponse.json({ record });
    }

    if (action === 'update-unit') {
      const record = await updateOrganizationUnit(auth.user.institutionId, body, actor);
      return NextResponse.json({ record });
    }

    if (action === 'update-position') {
      const record = await updateOrganizationPosition(auth.user.institutionId, body, actor);
      return NextResponse.json({ record });
    }

    return NextResponse.json(
      {
        error: 'Unsupported organization action.',
        code: 'ORGANIZATION_ACTION_INVALID'
      },
      { status: 400 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

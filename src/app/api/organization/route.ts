import { NextResponse } from 'next/server';
import {
  createLegalEntity,
  createOrganizationUnit,
  getOrganizationStructure
} from '@/lib/d1-organization';

export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  const code = error instanceof Error ? error.message : 'ORGANIZATION_ERROR';

  const messages: Record<string, { status: number; message: string }> = {
    INSTITUTION_REQUIRED: {
      status: 409,
      message: 'Register an institution before building the organization structure.'
    },
    LEGAL_ENTITY_REQUIRED_FIELDS: {
      status: 400,
      message: 'Legal entity code and name are required.'
    },
    LEGAL_ENTITY_CODE_CONFLICT: {
      status: 409,
      message: 'That legal entity code is already in use.'
    },
    ORG_UNIT_REQUIRED_FIELDS: {
      status: 400,
      message: 'Organization unit code, name, and type are required.'
    },
    ORG_UNIT_CODE_CONFLICT: {
      status: 409,
      message: 'That organization unit code is already in use.'
    },
    LEGAL_ENTITY_NOT_FOUND: {
      status: 400,
      message: 'The selected legal entity is not available for this institution.'
    },
    PARENT_UNIT_NOT_FOUND: {
      status: 400,
      message: 'The selected parent organization unit is not available.'
    }
  };

  const mapped = messages[code];
  if (mapped) return NextResponse.json({ error: mapped.message, code }, { status: mapped.status });

  console.error('Organization API error:', error);
  return NextResponse.json(
    { error: 'Organization data could not be saved to the production database.' },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const data = await getOrganizationStructure();
    return NextResponse.json({
      ...data,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Organization read error:', error);
    return NextResponse.json(
      { error: 'Organization data could not be read from the production database.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.kind === 'legalEntity') {
      const legalEntity = await createLegalEntity({
        code: String(body.code || ''),
        name: String(body.name || ''),
        country: typeof body.country === 'string' ? body.country : 'Indonesia',
        taxId: typeof body.taxId === 'string' ? body.taxId : null
      });
      return NextResponse.json({ legalEntity, storage: 'cloudflare-d1' }, { status: 201 });
    }

    if (body.kind === 'organizationUnit') {
      const organizationUnit = await createOrganizationUnit({
        code: String(body.code || ''),
        name: String(body.name || ''),
        type: String(body.type || ''),
        legalEntityId: typeof body.legalEntityId === 'string' ? body.legalEntityId : null,
        parentId: typeof body.parentId === 'string' ? body.parentId : null,
        headName: typeof body.headName === 'string' ? body.headName : null,
        headEmail: typeof body.headEmail === 'string' ? body.headEmail : null
      });
      return NextResponse.json({ organizationUnit, storage: 'cloudflare-d1' }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'Unsupported organization record type.' },
      { status: 400 }
    );
  } catch (error) {
    return apiError(error);
  }
}

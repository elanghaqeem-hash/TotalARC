import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { getTenantRegistry, sessionUser } from '@/lib/d1-auth';
import {
  listTenantDatabaseSlots,
  provisionInstitution,
  updateTenantStatus
} from '@/lib/d1-tenancy';

export const dynamic = 'force-dynamic';

async function actor() {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE_NAME)?.value || '';
  if (!token) throw new Error('AUTH_REQUIRED');
  return sessionUser(token);
}

export async function GET() {
  try {
    const current = await actor();
    if (!current.permissions.includes('tenant.manage')) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const [institutions, slots] = await Promise.all([
      getTenantRegistry(),
      listTenantDatabaseSlots()
    ]);

    return NextResponse.json({
      institutions,
      databaseSlots: slots,
      activeInstitution: current.institution,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json(
      { error: code === 'AUTH_REQUIRED' ? 'Authentication required.' : 'Unable to load institution administration.' },
      { status: code === 'AUTH_REQUIRED' ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = await actor();
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'CREATE_INSTITUTION') {
      const record = await provisionInstitution(
        {
          name: typeof body.name === 'string' ? body.name : '',
          legalName: typeof body.legalName === 'string' ? body.legalName : '',
          shortName: typeof body.shortName === 'string' ? body.shortName : '',
          institutionType: typeof body.institutionType === 'string' ? body.institutionType : '',
          country: typeof body.country === 'string' ? body.country : 'Indonesia',
          provinceState: typeof body.provinceState === 'string' ? body.provinceState : null,
          city: typeof body.city === 'string' ? body.city : null,
          registeredAddress: typeof body.registeredAddress === 'string' ? body.registeredAddress : null,
          operationalAddress: typeof body.operationalAddress === 'string' ? body.operationalAddress : null,
          website: typeof body.website === 'string' ? body.website : null,
          generalEmail: typeof body.generalEmail === 'string' ? body.generalEmail : null,
          telephone: typeof body.telephone === 'string' ? body.telephone : null,
          registrationNumber: typeof body.registrationNumber === 'string' ? body.registrationNumber : null,
          taxId: typeof body.taxId === 'string' ? body.taxId : null,
          parentCompany: typeof body.parentCompany === 'string' ? body.parentCompany : null,
          holdingCompany: typeof body.holdingCompany === 'string' ? body.holdingCompany : null,
          stockExchange: typeof body.stockExchange === 'string' ? body.stockExchange : null,
          ticker: typeof body.ticker === 'string' ? body.ticker : null,
          employeeCount: typeof body.employeeCount === 'string' ? body.employeeCount : null,
          revenueRange: typeof body.revenueRange === 'string' ? body.revenueRange : null,
          businessModel: typeof body.businessModel === 'string' ? body.businessModel : null,
          operatingModel: typeof body.operatingModel === 'string' ? body.operatingModel : null
        },
        current
      );
      return NextResponse.json(record, { status: 201 });
    }

    if (actionType === 'UPDATE_TENANT_STATUS') {
      const institutionId = typeof body.institutionId === 'string' ? body.institutionId : '';
      const status = body.status === 'Suspended' ? 'Suspended' : 'Active';
      if (!institutionId) {
        return NextResponse.json({ error: 'Institution is required.' }, { status: 400 });
      }
      const result = await updateTenantStatus(institutionId, status, current);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported institution administration action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const map: Record<string, [string, number]> = {
      AUTH_REQUIRED: ['Authentication required.', 401],
      ACCESS_DENIED: ['Only platform super administrators can provision institution tenants.', 403],
      INSTITUTION_REQUIRED_FIELDS: ['Institution name, legal name, short name and type are required.', 400],
      INSTITUTION_CONFLICT: ['Institution legal name already exists.', 409],
      NO_TENANT_DATABASE_SLOT: ['No dedicated tenant database slot is available. Add a new D1 binding before provisioning another institution.', 409],
      TENANT_DATABASE_SLOT_NOT_EMPTY: ['Selected tenant database slot is not empty.', 409],
      TENANT_NOT_FOUND: ['Tenant not found.', 404],
      PRIMARY_TENANT_CANNOT_BE_SUSPENDED: ['The primary control-plane tenant cannot be suspended through this action.', 409]
    };
    const known = map[code];
    console.error('Institution administration failed:', code || error);
    return NextResponse.json(
      { error: known?.[0] || 'Unable to process institution administration.' },
      { status: known?.[1] || 500 }
    );
  }
}

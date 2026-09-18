import { prisma } from '@/lib/prisma';
import { clientIp } from '@/lib/api';
import type { AuthUser } from '@/lib/auth';

export async function writeAudit(
  user: AuthUser,
  request: Request,
  input: {
    action: string;
    entityType: string;
    recordId: string;
    reason?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    institutionId?: string;
  }
) {
  const correlationId = request.headers.get('x-request-id') || crypto.randomUUID();
  return prisma.auditLog.create({
    data: {
      institutionId: input.institutionId || user.institutionId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: input.action,
      entityType: input.entityType,
      recordId: input.recordId,
      reason: input.reason || null,
      oldValue: input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
      newValue: input.newValue === undefined ? null : JSON.stringify(input.newValue),
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      correlationId
    }
  });
}

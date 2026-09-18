import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const tasks = await prisma.task.findMany({
      where: { institutionId: user.institutionId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }]
    });
    return NextResponse.json({ tasks });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 40);

    if (action === 'CREATE') {
      if (!['Admin','Reviewer','ProcessOwner'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Insufficient permission to create tasks');
      let userId: string | null = null;
      if (body.userId) {
        userId = requireString(body.userId, 'userId', 100);
        const assignee = await prisma.user.findFirst({ where: { id: userId, institutionId: user.institutionId, active: true } });
        if (!assignee) throw new ApiError(404, 'ASSIGNEE_NOT_FOUND', 'Assignee not found');
      }
      const dueDate = new Date(requireString(body.dueDate, 'dueDate', 50));
      if (Number.isNaN(dueDate.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'dueDate is invalid');
      const task = await prisma.task.create({
        data: {
          institutionId: user.institutionId,
          userId,
          title: requireString(body.title, 'title', 300),
          type: requireString(body.type, 'type', 80),
          dueDate,
          priority: optionalString(body.priority, 30) || 'Medium',
          status: 'Pending',
          entityRef: optionalString(body.entityRef, 250),
          link: optionalString(body.link, 500)
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'Task', recordId: task.id, newValue: task });
      return NextResponse.json(task, { status: 201 });
    }

    if (action === 'UPDATE_STATUS') {
      const id = requireString(body.id, 'id', 100);
      const status = requireString(body.status, 'status', 40);
      if (!['Pending','In Progress','Completed','Overdue'].includes(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid task status');
      const existing = await prisma.task.findFirst({ where: { id, institutionId: user.institutionId } });
      if (!existing) throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found');
      if (existing.userId && existing.userId !== user.id && !['Admin','Reviewer'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Only the assignee or reviewer can update this task');
      const updated = await prisma.task.update({ where: { id }, data: { status } });
      await writeAudit(user, request, { action: 'UPDATE', entityType: 'Task', recordId: id, oldValue: existing, newValue: updated });
      return NextResponse.json(updated);
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported task action');
  } catch (error) { return apiError(error); }
}

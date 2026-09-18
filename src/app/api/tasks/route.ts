import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

function withEffectiveStatus<T extends { status: string; dueDate: Date }>(task: T) {
  const overdue = task.status !== 'Completed' && task.dueDate.getTime() < Date.now();
  return { ...task, status: overdue ? 'Overdue' : task.status };
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const tasks = await prisma.task.findMany({
      where: { institutionId: user.institutionId },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }]
    });
    return NextResponse.json({ tasks: tasks.map(withEffectiveStatus) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 40);

    if (action === 'CREATE') {
      if (!['Admin','Reviewer','ProcessOwner'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'Insufficient permission to create tasks');
      }

      let userId: string | null = null;
      if (body.userId) {
        userId = requireString(body.userId, 'userId', 100);
        const assignee = await prisma.user.findFirst({
          where: { id: userId, institutionId: user.institutionId, active: true }
        });
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

      await writeAudit(user, request, {
        action: 'CREATE',
        entityType: 'Task',
        recordId: task.id,
        newValue: task
      });
      return NextResponse.json(withEffectiveStatus(task), { status: 201 });
    }

    if (action === 'UPDATE_STATUS') {
      const id = requireString(body.id, 'id', 100);
      const status = requireString(body.status, 'status', 40);
      if (!['Pending','In Progress','Completed'].includes(status)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Task status must be Pending, In Progress, or Completed. Overdue is derived from due date.');
      }

      const existing = await prisma.task.findFirst({
        where: { id, institutionId: user.institutionId }
      });
      if (!existing) throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found');

      const privileged = ['Admin','Reviewer'].includes(user.role);
      if (existing.userId) {
        if (existing.userId !== user.id && !privileged) {
          throw new ApiError(403, 'FORBIDDEN', 'Only the assignee, Admin, or Reviewer can update this task');
        }
      } else if (!privileged) {
        throw new ApiError(403, 'FORBIDDEN', 'Only Admin or Reviewer can update an unassigned task');
      }

      const updated = await prisma.task.update({
        where: { id },
        data: { status }
      });

      await writeAudit(user, request, {
        action: 'UPDATE',
        entityType: 'Task',
        recordId: id,
        oldValue: existing,
        newValue: updated
      });
      return NextResponse.json(withEffectiveStatus(updated));
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported task action');
  } catch (error) {
    return apiError(error);
  }
}

import { NextResponse } from 'next/server';
import {
  createTask,
  listTasksData,
  updateTaskStatus
} from '@/lib/d1-assurance';
import { recordMutationAudit } from '@/lib/d1-core';
import { getOrganizationData } from '@/lib/d1-organization';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [tasks, authorizedOrgUnitIds] = await Promise.all([
      listTasksData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    const scopedTasks = tasks.filter(task =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (task as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );

    return NextResponse.json({ tasks: scopedTasks, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch task data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(
    request,
    ['Admin', 'Reviewer', 'ProcessOwner', 'ControlOwner', 'Tester']
  );
  if (auth.response) return auth.response;

  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (actionType === 'CREATE_TASK') {
      const title = textValue(body, 'title');
      const type = textValue(body, 'type');
      const dueDate = textValue(body, 'dueDate');
      const priority = textValue(body, 'priority') || 'High';
      const userId = textValue(body, 'userId') || null;
      const orgUnitId = textValue(body, 'orgUnitId') || null;

      if (!title || !type || !dueDate) {
        return NextResponse.json(
          { error: 'title, type, and dueDate are required.' },
          { status: 400 }
        );
      }

      const organization = await getOrganizationData(auth.user.institutionId);
      const selectedUnit = orgUnitId
        ? organization.organizationUnits.find(unit => unit.id === orgUnitId)
        : null;
      const selectedUser = userId
        ? organization.users.find(user => user.id === userId && user.active)
        : null;

      if (!orgUnitId || !selectedUnit) {
        return NextResponse.json(
          { error: 'A valid organization unit is required for a task.' },
          { status: 400 }
        );
      }
      if (!isOrgUnitAuthorized(authorizedOrgUnitIds, orgUnitId)) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected task organization unit.',
            code: 'TASK_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }
      if (userId && !selectedUser) {
        return NextResponse.json({ error: 'Selected assignee is not an active institution user.' }, { status: 400 });
      }
      if (
        selectedUser?.orgUnitId
        && !isOrgUnitAuthorized(authorizedOrgUnitIds, selectedUser.orgUnitId)
      ) {
        return NextResponse.json(
          {
            error: 'The selected assignee is outside your organization scope.',
            code: 'TASK_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const task = await createTask({
        userId,
        orgUnitId,
        title,
        type,
        dueDate,
        priority,
        status: textValue(body, 'status') || 'Pending',
        entityRef: textValue(body, 'entityRef') || null,
        link: textValue(body, 'link') || null
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'Task',
        recordId: String(task?.id || ''),
        newValue: task,
        reason: 'Assurance task created.'
      }, actor);

      return NextResponse.json(task, { status: 201 });
    }

    if (actionType === 'UPDATE_STATUS') {
      const taskId = textValue(body, 'taskId');
      const status = textValue(body, 'status');
      if (!taskId || !status) {
        return NextResponse.json({ error: 'taskId and status are required.' }, { status: 400 });
      }

      const tasks = await listTasksData(auth.user.institutionId);
      const task = tasks.find(row => (row as Record<string, unknown>).id === taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
      }
      if (
        !isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          (task as Record<string, unknown>).orgUnitId as string | null | undefined
        )
      ) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for this task organization unit.',
            code: 'TASK_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const assignedUserId = (task as Record<string, unknown>).userId;
      if (
        !['Admin', 'Reviewer'].includes(auth.user.role)
        && assignedUserId
        && assignedUserId !== auth.user.id
      ) {
        return NextResponse.json(
          { error: 'Only the assignee, Admin, or Reviewer can update this task.' },
          { status: 403 }
        );
      }

      const updated = await updateTaskStatus({ taskId, status }, auth.user.institutionId);
      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'UPDATE',
        entityType: 'Task',
        recordId: taskId,
        newValue: updated,
        reason: 'Assurance task status updated.'
      }, actor);

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Unsupported task action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'TASK_NOT_FOUND' || code === 'TASK_USER_NOT_FOUND') {
      return NextResponse.json({ error: 'Task or assignee was not found.' }, { status: 404 });
    }

    console.error('Failed to persist task action:', error);
    return NextResponse.json(
      { error: 'Failed to persist task data.' },
      { status: 500 }
    );
  }
}

import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getAuth, rowToTask, taskToRow, appendTask, getAllTasks, clearTaskRow } from '../../../lib/tasksSheet';
import { notifyTeamMember, formatTaskMessage } from '../../../lib/telegram';
import { parseAssignees } from '../../../lib/teamMembers';

const SHEET_ID = process.env.BRAND_HUB_SHEET_ID;
const TAB_NAME = 'Tasks';

export async function GET() {
  try {
    const tasks = await getAllTasks();
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    return NextResponse.json({ error: 'Failed to fetch tasks', detail: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const task = await appendTask(body);
    return NextResponse.json({ task });
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    return NextResponse.json({ error: 'Failed to create task', detail: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { rowIndex, appendComment, ...updates } = body;
    if (!rowIndex) {
      return NextResponse.json({ error: 'rowIndex is required' }, { status: 400 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A${rowIndex}:O${rowIndex}`,
    });
    const existingRow = (existingRes.data.values || [[]])[0];
    const existingTask = rowToTask(existingRow, rowIndex);

    let mergedComments = existingTask.comments;
    if (appendComment) {
      const stamp = new Date().toLocaleString('ko-KR', { timeZone: 'America/Vancouver' });
      mergedComments = `[${stamp}] ${appendComment}\n${mergedComments}`.trim();
    }

    const mergedTask = {
      ...existingTask,
      ...updates,
      comments: appendComment ? mergedComments : (updates.comments ?? existingTask.comments),
      updatedAt: new Date().toISOString(),
    };

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A${rowIndex}:O${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [taskToRow(mergedTask)] },
    });

    // Status-change notification: only "needs_changes" pings anyone (the
    // assignee needs to know work got sent back). "needs_review" is
    // intentionally silent for now.
    if (updates.status && updates.status !== existingTask.status && updates.status === 'needs_changes' && mergedTask.assignedTo) {
      await notifyTeamMember(mergedTask.assignedTo, formatTaskMessage('✏️ 수정 요청이 왔어요', mergedTask), mergedTask);
    }

    // Assignment notification: only people NEWLY added to the task get
    // pinged (not those already on it, and not anyone removed).
    if (updates.assignedTo !== undefined) {
      const before = parseAssignees(existingTask.assignedTo);
      const added = parseAssignees(updates.assignedTo).filter((n) => !before.includes(n));
      if (added.length) {
        await notifyTeamMember(added.join(', '), formatTaskMessage('🔄 나에게 재배정된 태스크예요', mergedTask), mergedTask);
      }
    }

    // Comment notification: ping every assignee except the comment's author.
    // The client sends comments as "<author>: <text>".
    if (appendComment && mergedTask.assignedTo) {
      const sep = appendComment.indexOf(': ');
      const author = sep > 0 ? appendComment.slice(0, sep) : '';
      await notifyTeamMember(
        mergedTask.assignedTo,
        formatTaskMessage('💬 새 코멘트가 달렸어요', mergedTask, appendComment),
        mergedTask,
        [author]
      );
    }

    return NextResponse.json({ task: mergedTask });
  } catch (err) {
    console.error('PATCH /api/tasks error:', err);
    return NextResponse.json({ error: 'Failed to update task', detail: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rowIndex = searchParams.get('rowIndex');
    if (!rowIndex) {
      return NextResponse.json({ error: 'rowIndex is required' }, { status: 400 });
    }
    await clearTaskRow(rowIndex);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/tasks error:', err);
    return NextResponse.json({ error: 'Failed to delete task', detail: err.message }, { status: 500 });
  }
}

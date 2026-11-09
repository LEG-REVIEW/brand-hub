import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getAuth, rowToTask, taskToRow, appendTask, getAllTasks, clearTaskRow, vancouverDate } from '../../../lib/tasksSheet';
import { notifyTeamMember, formatTaskMessage } from '../../../lib/telegram';
import { parseAssignees } from '../../../lib/teamMembers';
import { syncTaskToCalendars } from '../../../lib/googleCalendar';

// Fields that show up on the calendar event; anything else (e.g. sortOrder
// reordering) doesn't need a Calendar API call.
const CALENDAR_FIELDS = ['client', 'taskTitle', 'taskDescription', 'status', 'assignedTo', 'dueDate', 'startDate', 'holdReason'];

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
      range: `${TAB_NAME}!A${rowIndex}:Q${rowIndex}`,
    });
    const existingRow = (existingRes.data.values || [[]])[0];
    const existingTask = rowToTask(existingRow, rowIndex);

    let mergedComments = existingTask.comments;
    if (appendComment) {
      const stamp = new Date().toLocaleString('ko-KR', { timeZone: 'America/Vancouver' });
      mergedComments = `[${stamp}] ${appendComment}\n${mergedComments}`.trim();
    }

    const statusChanging = updates.status && updates.status !== existingTask.status;

    // Putting a task On Hold requires saying what we're waiting for.
    if (statusChanging && updates.status === 'on_hold' && !String(updates.holdReason || '').trim()) {
      return NextResponse.json(
        { error: 'hold_reason_required', detail: 'On Hold로 바꾸려면 필요한 내용(hold reason)을 한 줄 입력해주세요.' },
        { status: 400 }
      );
    }

    const mergedTask = {
      ...existingTask,
      ...updates,
      comments: appendComment ? mergedComments : (updates.comments ?? existingTask.comments),
      updatedAt: new Date().toISOString(),
    };
    if (updates.holdReason !== undefined) mergedTask.holdReason = String(updates.holdReason).trim();
    if (statusChanging) {
      mergedTask.statusChangedAt = vancouverDate();
      // Leaving On Hold clears the reason so it can't go stale.
      if (mergedTask.status !== 'on_hold') mergedTask.holdReason = '';
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A${rowIndex}:Q${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [taskToRow(mergedTask)] },
    });

    if (CALENDAR_FIELDS.some((f) => updates[f] !== undefined)) {
      await syncTaskToCalendars(mergedTask);
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
    // Read the task first so its calendar events can be removed too.
    let existing = null;
    try {
      const auth = getAuth();
      const sheets = google.sheets({ version: 'v4', auth });
      const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB_NAME}!A${rowIndex}:Q${rowIndex}` });
      existing = rowToTask((r.data.values || [[]])[0], rowIndex);
    } catch (e) {
      console.error('DELETE pre-read failed:', e?.message || e);
    }
    await clearTaskRow(rowIndex);
    if (existing && existing.id) await syncTaskToCalendars(existing, { deleted: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/tasks error:', err);
    return NextResponse.json({ error: 'Failed to delete task', detail: err.message }, { status: 500 });
  }
}

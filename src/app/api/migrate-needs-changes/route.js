import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getAuth, getAllTasks, vancouverDate, RANGE } from '../../../lib/tasksSheet';
import { syncTaskToCalendars } from '../../../lib/googleCalendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-off: moves every task whose sheet status is still "needs_changes" to
// "on_hold". Only the status (col E) and statusChangedAt (col Q) cells are
// written — memo, hold reason, updatedAt and everything else stay untouched.
//   /api/migrate-needs-changes?key=CALENDAR_SECRET             → dry run (list only)
//   /api/migrate-needs-changes?key=CALENDAR_SECRET&apply=1     → do it
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (!process.env.CALENDAR_SECRET || searchParams.get('key') !== process.env.CALENDAR_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.BRAND_HUB_SHEET_ID, range: RANGE });
  const rows = res.data.values || [];
  const targets = rows
    .map((row, i) => ({ row, rowIndex: i + 2 }))
    .filter(({ row }) => row[0] && row[4] === 'needs_changes');

  const list = targets.map(({ row, rowIndex }) => ({
    rowIndex,
    id: row[0],
    client: row[1],
    taskTitle: row[2],
    assignedTo: row[11] || '',
    dueDate: row[12] || '',
  }));

  if (!searchParams.get('apply')) {
    return NextResponse.json({ dryRun: true, count: list.length, tasks: list });
  }

  const today = vancouverDate();
  if (targets.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.BRAND_HUB_SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: targets.flatMap(({ rowIndex }) => [
          { range: `Tasks!E${rowIndex}`, values: [['on_hold']] },
          { range: `Tasks!Q${rowIndex}`, values: [[today]] },
        ]),
      },
    });
  }

  // Re-read so calendar events reflect the new status.
  const fresh = await getAllTasks();
  const ids = new Set(list.map((t) => t.id));
  for (const t of fresh.filter((t) => ids.has(t.id))) {
    await syncTaskToCalendars(t);
  }
  return NextResponse.json({ applied: true, count: list.length, tasks: list });
}

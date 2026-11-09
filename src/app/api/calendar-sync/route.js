import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAllTasks, getAuth, vancouverDate } from '../../../lib/tasksSheet';
import { syncTaskToCalendars, getServiceAccountEmail } from '../../../lib/googleCalendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-off backfill: pushes existing tasks into the Google calendars.
//   /api/calendar-sync?key=CALENDAR_SECRET           → sync active tasks
//   /api/calendar-sync?key=CALENDAR_SECRET&info=1    → show the service account
//                                                      email to share calendars with
// Completed tasks older than 30 days are skipped to keep calendars clean.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (!process.env.CALENDAR_SECRET || searchParams.get('key') !== process.env.CALENDAR_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (searchParams.get('info')) {
    return NextResponse.json({ serviceAccountEmail: getServiceAccountEmail() });
  }

  // One-time fill: tasks with no statusChangedAt yet get today's date (col Q).
  // Only column Q is written; nothing else on the row is touched.
  const all = await getAllTasks();
  const missing = all.filter((t) => !t.statusChangedAt);
  if (missing.length) {
    const today = vancouverDate();
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.BRAND_HUB_SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: missing.map((t) => ({ range: `Tasks!Q${t.rowIndex}`, values: [[today]] })),
      },
    });
    missing.forEach((t) => { t.statusChangedAt = today; });
  }

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const tasks = all.filter((t) => {
    if (t.status === 'archived') return false;
    const date = t.dueDate || t.startDate;
    if (!date) return false;
    return t.status !== 'completed' || date >= cutoff;
  });

  // Sequential with a small pause (the API rejects fast bursts), and upsert
  // only — no wasted delete calls for people who aren't assigned.
  const mine = (new URL(request.url).searchParams.get('all') ? tasks : tasks.filter((t) => t.assignedTo));
  for (const t of mine) {
    await syncTaskToCalendars(t, { onlyUpsert: true });
    await new Promise((r) => setTimeout(r, 250));
  }
  return NextResponse.json({ attempted: mine.length, statusChangedFilled: missing.length });
}

import { NextResponse } from 'next/server';
import { getAllTasks } from '../../../lib/tasksSheet';
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

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const tasks = (await getAllTasks()).filter((t) => {
    if (t.status === 'archived') return false;
    const date = t.dueDate || t.startDate;
    if (!date) return false;
    return t.status !== 'completed' || date >= cutoff;
  });

  for (const t of tasks) await syncTaskToCalendars(t);
  return NextResponse.json({ synced: tasks.length });
}

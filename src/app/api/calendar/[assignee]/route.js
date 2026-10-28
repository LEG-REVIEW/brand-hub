import { NextResponse } from 'next/server';
import { getAllTasks } from '../../../../lib/tasksSheet';
import { parseAssignees } from '../../../../lib/teamMembers';

// One subscribable calendar feed per person. Each person gets their own URL:
//   /api/calendar/{their name}?key=CALENDAR_SECRET
// They add this URL in Google Calendar ("Other calendars" → "From URL") or
// Notion Calendar ("Add calendar" → "Add by URL" / iCal subscription), and
// it stays in sync automatically — the calendar app re-fetches it on its own
// schedule (usually every few hours).
//
// Protected by a shared secret query param so the URL can't be guessed and
// browsed by outsiders, since it exposes task titles/clients.

function pad(n) {
  return String(n).padStart(2, '0');
}

// All-day event date formatting: YYYYMMDD
function toIcsDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

// DTEND for all-day events is exclusive, so a single-day event needs
// DTEND = DTSTART + 1 day.
function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  needs_review: 'Needs Review',
  needs_changes: 'Needs Changes',
  completed: 'Completed',
};

export async function GET(request, { params }) {
  const { assignee: rawAssignee } = await params;
  const assignee = decodeURIComponent(rawAssignee);

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!process.env.CALENDAR_SECRET || key !== process.env.CALENDAR_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let tasks = [];
  try {
    tasks = await getAllTasks();
  } catch (err) {
    console.error('GET /api/calendar error:', err);
    return new NextResponse('Failed to load tasks', { status: 500 });
  }

  const relevant = tasks.filter((t) => t.status !== 'archived' && parseAssignees(t.assignedTo).includes(assignee) && (t.startDate || t.dueDate));

  const events = relevant
    .map((t) => {
      const start = t.startDate || t.dueDate;
      const end = t.dueDate || t.startDate;
      const dtstart = toIcsDate(start);
      const dtend = toIcsDate(addOneDay(end));
      const summary = escapeIcsText(`${t.client ? `[${t.client}] ` : ''}${t.taskTitle}`);
      const description = escapeIcsText(
        [t.taskDescription, `Status: ${STATUS_LABELS[t.status] || t.status}`].filter(Boolean).join('\\n\\n')
      );

      return [
        'BEGIN:VEVENT',
        `UID:${t.id}@brand-hub`,
        `DTSTAMP:${toIcsDate(new Date().toISOString().slice(0, 10))}T000000Z`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `DTEND;VALUE=DATE:${dtend}`,
        `SUMMARY:${summary}`,
        description ? `DESCRIPTION:${description}` : null,
        'END:VEVENT',
      ]
        .filter(Boolean)
        .join('\r\n');
    })
    .join('\r\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brand Hub//Tasks//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(`${assignee} 태스크`)}`,
    events,
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tasks.ics"',
    },
  });
}

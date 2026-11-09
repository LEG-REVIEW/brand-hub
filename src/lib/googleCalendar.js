import { google } from 'googleapis';
import { parseAssignees, TEAM_MEMBER_CALENDAR_IDS } from './teamMembers';

// Pushes tasks into each person's Google Calendar through the Calendar API
// (near-instant), instead of waiting for Google to re-fetch the iCal feed.
//
// Each person has their own calendar (TEAM_MEMBER_CALENDAR_IDS) shared with
// the service account with "Make changes to events". A task becomes an
// all-day event (startDate → dueDate) on every assignee's calendar. The
// event id is derived from the task id, so no extra sheet column is needed.

const APP_URL = process.env.APP_URL || 'https://brand-hub-mu-black.vercel.app';

const STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  needs_review: 'Needs Review',
  needs_changes: 'Needs Changes',
  completed: 'Completed',
};

function getCalendar() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );
  return google.calendar({ version: 'v3', auth });
}

export function getServiceAccountEmail() {
  try {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email;
  } catch {
    return null;
  }
}

// Google event ids allow only a–v and 0–9 (base32hex), 5–1024 chars. Task ids
// contain underscores, so hex-encode them (hex digits are a valid subset).
function eventIdFor(taskId) {
  return Buffer.from(String(taskId)).toString('hex');
}

function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function buildEvent(task) {
  const start = task.startDate || task.dueDate;
  const end = task.dueDate || task.startDate;
  // Guard against start after end (Google rejects it).
  const [s, e] = start <= end ? [start, end] : [end, end];
  const done = task.status === 'completed';
  return {
    id: eventIdFor(task.id),
    status: 'confirmed',
    summary: `${done ? '✅ ' : ''}${task.client ? `[${task.client}] ` : ''}${task.taskTitle}`,
    description: [
      task.taskDescription,
      `Status: ${STATUS_LABELS[task.status] || task.status}`,
      `${APP_URL}/tasks?task=${task.id}`,
    ].filter(Boolean).join('\n\n'),
    start: { date: s },
    end: { date: addOneDay(e) },
  };
}

function code(err) {
  return err?.code || err?.response?.status;
}

async function upsertEvent(cal, calendarId, task) {
  const event = buildEvent(task);
  try {
    await cal.events.insert({ calendarId, requestBody: event });
  } catch (err) {
    if (code(err) === 409) {
      // Already exists (or was deleted earlier) — overwrite / restore it.
      await cal.events.update({ calendarId, eventId: event.id, requestBody: event });
    } else {
      throw err;
    }
  }
}

async function removeEvent(cal, calendarId, task) {
  try {
    await cal.events.delete({ calendarId, eventId: eventIdFor(task.id) });
  } catch (err) {
    // 404 = never existed, 410 = already deleted. Both are fine.
    if (code(err) !== 404 && code(err) !== 410) throw err;
  }
}

// Makes every configured calendar match the task: upsert where the task
// should appear, delete where it shouldn't (reassigned, archived, deleted,
// dates cleared). Never throws — calendar sync must not break task saving.
export async function syncTaskToCalendars(task, { deleted = false } = {}) {
  try {
    const entries = Object.entries(TEAM_MEMBER_CALENDAR_IDS).filter(([, id]) => id);
    if (!entries.length || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return;
    const cal = getCalendar();
    const assignees = parseAssignees(task.assignedTo);
    const hasDate = !!(task.startDate || task.dueDate);
    const shouldExist = !deleted && task.status !== 'archived' && hasDate;

    for (const [member, calendarId] of entries) {
      try {
        if (shouldExist && assignees.includes(member)) {
          await upsertEvent(cal, calendarId, task);
        } else {
          await removeEvent(cal, calendarId, task);
        }
      } catch (err) {
        console.error(`Calendar sync failed for ${member} / ${task.id}:`, err?.message || err);
      }
    }
  } catch (err) {
    console.error('Calendar sync error:', err?.message || err);
  }
}

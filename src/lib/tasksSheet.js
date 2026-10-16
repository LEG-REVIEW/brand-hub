import { google } from 'googleapis';
import { notifyTeamMember, formatTaskMessage } from './telegram';

const SHEET_ID = process.env.BRAND_HUB_SHEET_ID;
const TAB_NAME = 'Tasks';
export const RANGE = `${TAB_NAME}!A2:O`;

// Column order:
// id | client | taskTitle | taskDescription | status | links | screenshotImageIds | designImageIds | comments | createdAt | updatedAt | assignedTo | dueDate | startDate | sortOrder

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

export function rowToTask(row, rowIndex) {
  return {
    rowIndex,
    id: row[0] || '',
    client: row[1] || '',
    taskTitle: row[2] || '',
    taskDescription: row[3] || '',
    status: row[4] || 'not_started',
    links: row[5] ? row[5].split(',').map((s) => s.trim()).filter(Boolean) : [],
    screenshotImageIds: row[6] ? row[6].split(',').map((s) => s.trim()).filter(Boolean) : [],
    designImageIds: row[7] ? row[7].split(',').map((s) => s.trim()).filter(Boolean) : [],
    comments: row[8] || '',
    createdAt: row[9] || '',
    updatedAt: row[10] || '',
    assignedTo: row[11] || '',
    dueDate: row[12] || '',
    startDate: row[13] || '',
    // Controls up/down card ordering within a status column (Completed excluded).
    // Legacy rows created before this column existed read as 0, so they sort
    // before newer tasks (which get a large Date.now() value) — that's fine.
    sortOrder: Number(row[14]) || 0,
  };
}

export function taskToRow(task) {
  return [
    task.id,
    task.client,
    task.taskTitle,
    task.taskDescription || '',
    task.status,
    (task.links || []).join(', '),
    (task.screenshotImageIds || []).join(', '),
    (task.designImageIds || []).join(', '),
    task.comments || '',
    task.createdAt,
    task.updatedAt,
    task.assignedTo || '',
    task.dueDate || '',
    task.startDate || '',
    task.sortOrder != null ? task.sortOrder : Date.now(),
  ];
}

// Creates one new task row. Used by both the manual "New Task" modal (via
// /api/tasks POST) and the weekly recurring-task cron job.
export async function appendTask(partialTask, { notify = true, notifyExclude = [] } = {}) {
  const now = new Date().toISOString();
  const newTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    client: partialTask.client || '',
    taskTitle: partialTask.taskTitle || '',
    taskDescription: partialTask.taskDescription || '',
    status: 'not_started',
    links: partialTask.links || [],
    screenshotImageIds: partialTask.screenshotImageIds || [],
    designImageIds: [],
    comments: partialTask.comments || '',
    createdAt: now,
    updatedAt: now,
    assignedTo: partialTask.assignedTo || '',
    dueDate: partialTask.dueDate || '',
    startDate: partialTask.startDate || todayStr(),
    // New tasks go to the bottom of their column by default.
    sortOrder: Date.now(),
  };

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Explicitly compute the next row instead of using values.append's
  // "auto-detect the table" behavior — a blank row in the middle of the
  // sheet was confusing that auto-detection and causing new rows to land
  // shifted one column to the right.
  const colARes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A2:A`,
  });
  const nextRow = 2 + (colARes.data.values || []).length;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A${nextRow}:O${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [taskToRow(newTask)] },
  });

  // Fires for every creation path (manual "New Task" modal, weekly recurring
  // cron, holiday reminder cron) since they all funnel through appendTask.
  if (notify && newTask.assignedTo) {
    // Awaited (not fire-and-forget) since Vercel serverless functions can be
    // frozen/torn down right after the response is sent, which would drop
    // an un-awaited notification.
    await notifyTeamMember(newTask.assignedTo, formatTaskMessage('🆕 새 태스크가 배정됐어요', newTask), newTask, notifyExclude);
  }

  return newTask;
}

export async function getAllTasks() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });
  const rows = res.data.values || [];
  return rows.map((row, i) => rowToTask(row, i + 2)).filter((t) => t.id);
}

// Sheets row deletion is unreliable via the API, so "delete" clears the row's
// content instead. GET already filters out rows with an empty id.
export async function clearTaskRow(rowIndex) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A${rowIndex}:O${rowIndex}`,
  });
}

// Sends Telegram notifications to team members. Requires:
//   1. A bot created via @BotFather on Telegram -> TELEGRAM_BOT_TOKEN env var.
//   2. Each team member has started a chat with that bot at least once, and
//      their numeric chat_id is filled into TEAM_MEMBER_TELEGRAM_IDS in
//      teamMembers.js (get it by visiting
//      https://api.telegram.org/bot<TOKEN>/getUpdates after they message the bot).
// Notifications are best-effort: if the token or a person's chat ID isn't
// set up yet, sending is silently skipped rather than breaking task creation
// or updates.

import { TEAM_MEMBER_TELEGRAM_IDS, parseAssignees } from './teamMembers';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!BOT_TOKEN || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Telegram sendMessage failed:', res.status, detail);
    }
  } catch (err) {
    console.error('Telegram sendMessage error:', err);
  }
}

// Telegram API helpers for inline-button interactions.
async function callTelegram(method, payload) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`Telegram ${method} error:`, err);
  }
}
export const answerCallbackQuery = (id, text) => callTelegram('answerCallbackQuery', { callback_query_id: id, text });
export const removeButtons = (chatId, messageId) =>
  callTelegram('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });

// Downloads a file a user sent to the bot (bots can fetch up to 20MB).
export async function downloadTelegramFile(fileId) {
  if (!BOT_TOKEN) throw new Error('No TELEGRAM_BOT_TOKEN');
  const info = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
  if (!info.ok) throw new Error(`getFile failed: ${JSON.stringify(info)}`);
  const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`);
  if (!res.ok) throw new Error(`file download failed: ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), filePath: info.result.file_path };
}

// Looks up the team member's chat_id and sends them a message. No-op if
// that person hasn't been set up in TEAM_MEMBER_TELEGRAM_IDS yet.
// `names` may be one name or a comma-separated list of assignees; `exclude`
// is an array of names to skip (e.g. the person who made the change).
export async function notifyTeamMember(names, text, task, exclude = []) {
  for (const name of parseAssignees(names)) {
    if (exclude.includes(name)) continue;
    const chatId = TEAM_MEMBER_TELEGRAM_IDS[name];
    if (!chatId) continue;
    await sendTelegramMessage(chatId, text, task ? taskButton(task) : {});
  }
}

const APP_URL = process.env.APP_URL || 'https://brand-hub-mu-black.vercel.app';

// Builds a notification body: heading, [client] title, due date, a short
// description preview, and a link that opens the task's modal directly
// (TaskBoard reads ?task=<id> on load).
export function formatTaskMessage(heading, task, bodyOverride) {
  const lines = [heading, '', `[${task.client}] ${task.taskTitle}`];
  if (task.dueDate) lines.push(`📅 마감: ${task.dueDate}`);
  const desc = (bodyOverride ?? task.taskDescription ?? '').trim();
  if (desc) lines.push('', desc.length > 200 ? `${desc.slice(0, 200)}…` : desc);
  return lines.join('\n');
}

// Inline button that opens the task modal (instead of a long raw URL).
export function taskButton(task) {
  return {
    reply_markup: { inline_keyboard: [[{ text: '📋 태스크 열기', url: `${APP_URL}/tasks?task=${task.id}` }]] },
  };
}

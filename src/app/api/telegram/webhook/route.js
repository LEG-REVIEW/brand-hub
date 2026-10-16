import { NextResponse } from 'next/server';
import { clients } from '../../../clients';
import { appendTask } from '../../../../lib/tasksSheet';
import { TEAM_MEMBERS, TEAM_MEMBER_TELEGRAM_IDS } from '../../../../lib/teamMembers';
import { sendTelegramMessage, formatTaskMessage, answerCallbackQuery, removeButtons, taskButton, downloadTelegramFile } from '../../../../lib/telegram';
import { getDraftState, setDraftState, clearDraftState } from '../../../../lib/telegramDrafts';
import { put } from '@vercel/blob';

// Telegram sends every message sent to the bot here (registered once via
// setWebhook). Task creation is an explicit flow: /newtask -> format guide ->
// user sends text -> preview with 저장/수정/취소 buttons -> save. No AI: the
// client is matched by name, URLs become links, first line is the title.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const HELP = [
  '📝 태스크 만들기: 내용을 그냥 보내세요. 초안을 보여드리고, 저장 버튼을 눌러야 만들어져요.',
  '작성 방법이 궁금하면 /newtask (또는 새태스크) 를 보내세요.',
  '',
  '/newtask — 새 태스크 작성',
  '/cancel — 작성 중이던 것 취소',
  '/help — 도움말',
].join('\n');

const GUIDE = [
  '📝 새 태스크 내용을 한 번에 보내주세요.',
  '',
  '예)',
  'Cocorico 메뉴 사진 3장 수정',
  '자세한 설명은 여기부터 (여러 줄 가능)',
  'https://링크는 자동으로 링크로 저장돼요',
  '@경민',
  '',
  '• 첫 줄 = 제목, 나머지 = 설명',
  '• 클라이언트 이름(예: Cocorico, 월하)이 글 안에 있으면 자동 지정',
  '• 담당자는 기본이 나. 다른 사람은 @경민 처럼 쓰기 (여러 명: @경민 @상원)',
  '• 사진을 같이 보내면 태스크에 첨부돼요 (캡션에 내용 쓰기). 사진만 보내도 돼요.',
  '',
  '(취소: /cancel)',
].join('\n');

const CLIENT_BUTTONS = {
  inline_keyboard: [
    [
      { text: '⏭ 클라이언트 없이 진행', callback_data: 'skipclient' },
      { text: '🗑 취소', callback_data: 'cancel' },
    ],
  ],
};

const BUTTONS = {
  inline_keyboard: [
    [
      { text: '✅ 저장', callback_data: 'save' },
      { text: '✏️ 수정', callback_data: 'edit' },
      { text: '🗑 취소', callback_data: 'cancel' },
    ],
  ],
};

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

// Alias list per client: full name, Korean name, id, and the first word of
// the name when no other client shares it (so "Joayo" alone stays ambiguous).
const firstWordCounts = {};
clients.forEach((c) => {
  const w = norm(c.name.split(/\s+/)[0]);
  firstWordCounts[w] = (firstWordCounts[w] || 0) + 1;
});
const CLIENT_ALIASES = clients
  .filter((c) => c.active)
  .map((c) => {
    const first = norm(c.name.split(/\s+/)[0]);
    const aliases = [norm(c.name), norm(c.nameKo), norm(c.id)];
    if (firstWordCounts[first] === 1) aliases.push(first);
    return { name: c.name, aliases: aliases.filter((a) => a.length >= 2) };
  });

function findClient(text) {
  const t = norm(text);
  let best = null;
  for (const c of CLIENT_ALIASES) {
    for (const a of c.aliases) {
      if (t.includes(a) && (!best || a.length > best.len)) best = { name: c.name, len: a.length };
    }
  }
  return best?.name || '';
}

// Downloads a Telegram photo and stores it in Vercel Blob. Tries a private
// store first, then a public one, and returns a reference string
// (see lib/attachments.js).
async function savePhoto(fileId) {
  const { buffer, filePath } = await downloadTelegramFile(fileId);
  const ext = (filePath.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const name = `telegram/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  try {
    const r = await put(name, buffer, { access: 'private', contentType, addRandomSuffix: false });
    return `blob:p:${r.pathname}`;
  } catch (err) {
    const r = await put(name, buffer, { access: 'public', contentType, addRandomSuffix: false });
    return `blob:u:${r.url}`;
  }
}

// Greetings / acknowledgements that shouldn't start a task draft when sent
// out of the blue (any other message becomes a draft the user can still cancel).
const CHATTER = /^(ㅇㅇ|ㅇㅋ|ㅋ+|ㅎ+|ㅠ+|네+|넵|넹|응|아니|감사(합니다|해요)?|고마워(요)?|ok|okay|thanks|thx|hi|hello|안녕(하세요)?)[\s!.~?]*$/i;
const isChatter = (t) => !t || t.replace(/\s/g, '').length < 3 || CHATTER.test(t.trim());

function parseDraft(text, sender) {
  // @이름 can appear several times -> multiple assignees (default: sender)
  const assignees = [];
  let body = text;
  for (const name of TEAM_MEMBERS) {
    if (body.includes(`@${name}`)) {
      assignees.push(name);
      body = body.split(`@${name}`).join('');
    }
  }
  const assignedTo = (assignees.length ? assignees : [sender]).join(', ');
  const client = findClient(body);
  const links = [...new Set(body.match(/https?:\/\/[^\s]+/g) || [])];
  const lines = body
    .split('\n')
    .map((l) => l.replace(/https?:\/\/[^\s]+/g, '').trim())
    .filter(Boolean);
  if (client && lines.length > 1 && norm(lines[0]) === norm(client)) lines.shift();
  return {
    client,
    taskTitle: (lines[0] || links[0] || '(제목 없음)').slice(0, 100),
    taskDescription: lines.slice(1).join('\n'),
    links,
    assignedTo,
  };
}

// Applies a follow-up text message to an existing draft (so adding a title
// after a photo keeps the client, photos and assignee):
//  - a message that is only a client name just sets the client
//  - otherwise it supplies title/description (and @assignee / links / client
//    if present); anything it doesn't mention is kept from the old draft.
function mergeDraft(old, text, sender) {
  const p = parseDraft(text, sender);
  if (p.client && !p.taskDescription && norm(p.taskTitle) === norm(p.client)) {
    return { ...old, client: p.client };
  }
  const explicit = TEAM_MEMBERS.some((n) => text.includes(`@${n}`));
  return {
    ...old,
    client: p.client || old.client,
    taskTitle: p.taskTitle,
    taskDescription: p.taskDescription,
    links: p.links.length ? p.links : old.links,
    assignedTo: explicit ? p.assignedTo : old.assignedTo,
  };
}

function previewText(d) {
  const lines = [
    '👀 이렇게 저장할까요?',
    '',
    `클라이언트: ${d.client || '❓ 못 찾음 (저장 후 앱에서 지정)'}`,
    `제목: ${d.taskTitle}`,
    `담당: ${d.assignedTo}`,
  ];
  if (d.taskDescription) lines.push('', `설명:\n${d.taskDescription}`);
  if (d.links.length) lines.push('', `링크:\n${d.links.join('\n')}`);
  if (d.photos?.length) lines.push('', `📎 사진 ${d.photos.length}장`);
  return lines.join('\n');
}

export async function POST(request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Always answer 200 after this point, otherwise Telegram retries the update.
  try {
    const update = await request.json();
    const cb = update.callback_query;
    const msg = cb ? cb.message : update.message;
    if (!msg?.chat?.id) return NextResponse.json({ ok: true });

    const chatId = String(msg.chat.id);
    const sender = Object.keys(TEAM_MEMBER_TELEGRAM_IDS).find((n) => TEAM_MEMBER_TELEGRAM_IDS[n] === chatId);

    if (!sender) {
      await sendTelegramMessage(
        chatId,
        `아직 등록 안 된 사용자예요. 슬기님께 이 번호를 알려주세요.\n\nchat_id: ${chatId}`
      );
      return NextResponse.json({ ok: true });
    }

    // --- Button presses (저장 / 수정 / 취소) ---
    if (cb) {
      const { state, draft } = await getDraftState(chatId);
      if (cb.data === 'skipclient' && state === 'awaiting_client' && draft) {
        await answerCallbackQuery(cb.id);
        await removeButtons(chatId, msg.message_id);
        await setDraftState(chatId, 'awaiting_confirm', draft);
        await sendTelegramMessage(chatId, previewText(draft), { reply_markup: BUTTONS });
        return NextResponse.json({ ok: true });
      }
      if (cb.data === 'cancel' && state === 'awaiting_client') {
        await answerCallbackQuery(cb.id);
        await removeButtons(chatId, msg.message_id);
        await clearDraftState(chatId);
        await sendTelegramMessage(chatId, '🗑 취소했어요. 새로 만들려면 /newtask');
        return NextResponse.json({ ok: true });
      }
      if (state !== 'awaiting_confirm' || !draft) {
        await answerCallbackQuery(cb.id, '이미 처리됐거나 만료된 요청이에요.');
        await removeButtons(chatId, msg.message_id);
        return NextResponse.json({ ok: true });
      }
      await answerCallbackQuery(cb.id);
      await removeButtons(chatId, msg.message_id);

      if (cb.data === 'save') {
        // Sender gets the confirmation below, so skip the self-assign notification.
        const task = await appendTask({ ...draft, screenshotImageIds: draft.photos || [] }, { notifyExclude: [sender] });
        await clearDraftState(chatId);
        let reply = formatTaskMessage('✅ 태스크를 저장했어요', task);
        if (!draft.client) reply += '\n\n※ 클라이언트가 비어있어요. 앱에서 지정해주세요.';
        if (draft.assignedTo !== sender) reply += `\n※ 담당: ${draft.assignedTo}`;
        await sendTelegramMessage(chatId, reply, taskButton(task));
      } else if (cb.data === 'edit') {
        await setDraftState(chatId, 'awaiting_text', { photos: draft.photos || [] });
        await sendTelegramMessage(chatId, '✏️ 수정한 내용을 처음부터 다시 보내주세요. (취소: /cancel)');
      } else {
        await clearDraftState(chatId);
        await sendTelegramMessage(chatId, '🗑 취소했어요. 새로 만들려면 /newtask');
      }
      return NextResponse.json({ ok: true });
    }

    // --- Text messages ---
    const text = (msg.text || msg.caption || '').trim();
    // Triggers: exact message only (so a real task text containing these words
    // isn't hijacked). Slash optional, spaces/case ignored.
    const key = text.toLowerCase().replace(/^\//, '').replace(/@\w+$/, '').replace(/\s+/g, '');
    const NEW_TRIGGERS = ['newtask', '새태스크', '새테스크', '새작업', '태스크', '테스크', '태스크추가', '테스크추가'];
    const CANCEL_TRIGGERS = ['cancel', '취소'];
    const HELP_TRIGGERS = ['start', 'help', '도움말'];
    const cmd = NEW_TRIGGERS.includes(key) ? '/newtask' : CANCEL_TRIGGERS.includes(key) ? '/cancel' : HELP_TRIGGERS.includes(key) ? '/help' : '';

    if (cmd === '/help') {
      await sendTelegramMessage(chatId, HELP);
    } else if (cmd === '/newtask') {
      await setDraftState(chatId, 'awaiting_text', null);
      await sendTelegramMessage(chatId, GUIDE);
    } else if (cmd === '/cancel') {
      await clearDraftState(chatId);
      await sendTelegramMessage(chatId, '🗑 취소했어요. 새로 만들려면 /newtask');
    } else {
      const { state, draft: pending } = await getDraftState(chatId);
      const fileId = msg.photo?.length
        ? msg.photo[msg.photo.length - 1].file_id
        : msg.document?.mime_type?.startsWith('image/')
          ? msg.document.file_id
          : null;
      const groupId = msg.media_group_id || '';

      // Save the photo (if any) to Blob first.
      let photo = null;
      if (fileId) {
        try {
          photo = await savePhoto(fileId);
        } catch (err) {
          console.error('savePhoto failed:', err);
          await sendTelegramMessage(chatId, '⚠️ 사진 저장에 실패했어요. 잠시 후 다시 보내주세요.');
          return NextResponse.json({ ok: true });
        }
      }
      const carry = ['awaiting_text', 'awaiting_confirm', 'awaiting_client'].includes(state) ? pending?.photos || [] : [];
      const photos = photo ? [...carry, photo] : carry;

      const askClient = async (d) => {
        await setDraftState(chatId, 'awaiting_client', d);
        await sendTelegramMessage(chatId, `클라이언트를 못 찾았어요.\n제목: ${d.taskTitle}${d.photos?.length ? `\n📎 사진 ${d.photos.length}장` : ''}\n\n클라이언트 이름만 따로 보내주세요. (예: Cocorico, 월하)`, {
          reply_markup: CLIENT_BUTTONS,
        });
      };
      const showPreview = async (d) => {
        await setDraftState(chatId, 'awaiting_confirm', d);
        await sendTelegramMessage(chatId, previewText(d), { reply_markup: BUTTONS });
      };

      if (text && !fileId && pending?.taskTitle && (state === 'awaiting_client' || state === 'awaiting_confirm')) {
        // Follow-up text on an open draft: merge instead of starting over.
        const d = mergeDraft(pending, text, sender);
        if (!d.client) await askClient(d);
        else await showPreview(d);
      } else if (fileId && !text) {
        // Photo(s) without a caption
        if (state === 'awaiting_confirm' && pending) {
          pending.photos = photos;
          const sameAlbum = groupId && pending.mediaGroupId === groupId;
          if (groupId) pending.mediaGroupId = groupId;
          if (sameAlbum) await setDraftState(chatId, 'awaiting_confirm', pending); // part of an album already previewed
          else await showPreview(pending);
        } else if (state === 'awaiting_client' && pending) {
          pending.photos = photos;
          await setDraftState(chatId, 'awaiting_client', pending);
          await sendTelegramMessage(chatId, `📎 사진을 추가했어요 (${photos.length}장). 클라이언트 이름을 보내주세요.`, { reply_markup: CLIENT_BUTTONS });
        } else {
          await askClient({
            client: '',
            taskTitle: '(사진 첨부)',
            taskDescription: '',
            links: [],
            assignedTo: sender,
            photos,
            mediaGroupId: groupId,
          });
        }
      } else if (state === 'awaiting_text' || state === 'awaiting_confirm' || state === 'awaiting_client' || (state === 'idle' && !isChatter(text))) {
        if (!text) {
          await sendTelegramMessage(chatId, '글이나 사진을 보내주세요.');
        } else {
          // A new message while a preview is open simply replaces the draft
          // (but keeps already attached photos).
          const draft = parseDraft(text, sender);
          draft.photos = photos;
          if (groupId) draft.mediaGroupId = groupId;
          if (!draft.client) await askClient(draft);
          else await showPreview(draft);
        }
      } else {
        await sendTelegramMessage(chatId, '태스크 내용을 그대로 보내주시면 초안을 만들어 드려요. (도움말: /help)');
      }
    }
  } catch (err) {
    console.error('Telegram webhook error:', err);
  }
  return NextResponse.json({ ok: true });
}

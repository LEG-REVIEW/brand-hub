import { NextResponse } from 'next/server';
import { clients } from '../../../clients';
import { appendTask } from '../../../../lib/tasksSheet';
import { TEAM_MEMBERS, TEAM_MEMBER_TELEGRAM_IDS } from '../../../../lib/teamMembers';
import { sendTelegramMessage, formatTaskMessage, answerCallbackQuery, removeButtons, taskButton } from '../../../../lib/telegram';
import { getDraftState, setDraftState, clearDraftState } from '../../../../lib/telegramDrafts';

// Telegram sends every message sent to the bot here (registered once via
// setWebhook). Task creation is an explicit flow: /newtask -> format guide ->
// user sends text -> preview with 저장/수정/취소 buttons -> save. No AI: the
// client is matched by name, URLs become links, first line is the title.
export const dynamic = 'force-dynamic';

const HELP = [
  '📝 태스크 만들기: /newtask 를 보내세요.',
  '그러면 작성 방법을 알려드리고, 내용을 보내면 확인 후 저장해요.',
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
  '• 사진은 못 받아요. 사진은 앱에서 Drive 폴더에 넣어주세요.',
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
        const task = await appendTask(draft, { notifyExclude: [sender] });
        await clearDraftState(chatId);
        let reply = formatTaskMessage('✅ 태스크를 저장했어요', task);
        if (!draft.client) reply += '\n\n※ 클라이언트가 비어있어요. 앱에서 지정해주세요.';
        if (draft.assignedTo !== sender) reply += `\n※ 담당: ${draft.assignedTo}`;
        await sendTelegramMessage(chatId, reply, taskButton(task));
      } else if (cb.data === 'edit') {
        await setDraftState(chatId, 'awaiting_text', null);
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
      if (state === 'awaiting_client' && pending && text) {
        // Expecting just a client name; anything else is re-asked.
        const c = findClient(text);
        if (c) {
          pending.client = c;
          await setDraftState(chatId, 'awaiting_confirm', pending);
          await sendTelegramMessage(chatId, previewText(pending), { reply_markup: BUTTONS });
        } else {
          await sendTelegramMessage(chatId, '그 이름의 클라이언트를 못 찾았어요. 클라이언트 이름만 다시 보내주세요. (예: Cocorico, 월하)', {
            reply_markup: CLIENT_BUTTONS,
          });
        }
      } else if (state === 'awaiting_text' || state === 'awaiting_confirm') {
        if (!text) {
          await sendTelegramMessage(chatId, '글로 보내주세요. 사진은 저장할 수 없어요.');
        } else {
          // A new message while a preview is open simply replaces the draft.
          const draft = parseDraft(text, sender);
          if (!draft.client) {
            await setDraftState(chatId, 'awaiting_client', draft);
            await sendTelegramMessage(chatId, `클라이언트를 못 찾았어요.\n제목: ${draft.taskTitle}\n\n클라이언트 이름만 따로 보내주세요. (예: Cocorico, 월하)`, {
              reply_markup: CLIENT_BUTTONS,
            });
          } else {
            await setDraftState(chatId, 'awaiting_confirm', draft);
            await sendTelegramMessage(chatId, previewText(draft), { reply_markup: BUTTONS });
          }
        }
      } else {
        await sendTelegramMessage(chatId, '태스크를 만들려면 먼저 /newtask 를 보내주세요.\n(도움말: /help)');
      }
    }
  } catch (err) {
    console.error('Telegram webhook error:', err);
  }
  return NextResponse.json({ ok: true });
}

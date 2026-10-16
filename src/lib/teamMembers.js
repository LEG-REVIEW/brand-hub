// Who a task can be assigned to. Edit this list when the team changes —
// no other code needs to change.
export const TEAM_MEMBERS = ['슬기', '경민', '상원', '정진', '대표님'];

// A color per person, used for badges/chips throughout the board. Add a new
// name here too when adding someone to TEAM_MEMBERS above. Falls back to a
// neutral grey for anyone not listed.
export const TEAM_MEMBER_COLORS = {
  슬기: '#8FA8C8',
  경민: '#E3A994',
  상원: '#B7C9A8',
  정진: '#A88BB8',
  대표님: '#D8B26A',
};

export function getTeamMemberColor(name) {
  return TEAM_MEMBER_COLORS[name] || '#B0B0B0';
}

// Telegram chat_id per person, for the Telegram notification feature
// (see src/lib/telegram.js). To fill these in:
//   1. Create a bot via @BotFather on Telegram, set TELEGRAM_BOT_TOKEN
//      in Vercel env vars to the token it gives you.
//   2. Have each person send any message to that bot once.
//   3. Visit https://api.telegram.org/bot<TOKEN>/getUpdates in a browser —
//      each person's chat_id shows up in the JSON response.
// Leave a value as '' until that person is set up; notifications to them
// are simply skipped until then (no error, no crash).
export const TEAM_MEMBER_TELEGRAM_IDS = {
  슬기: '8860998831',
  경민: '8914313866',
  상원: '',
  정진: '',
  대표님: '',
};

// A task can have several assignees. They're stored in the single
// "assignedTo" sheet column as a comma-separated string ("슬기, 경민"), so
// older single-name rows keep working unchanged.
export function parseAssignees(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
export const hasAssignee = (value, name) => parseAssignees(value).includes(name);
export function toggleAssignee(value, name) {
  const list = parseAssignees(value);
  return (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]).join(', ');
}

import { NextResponse } from 'next/server';
import { appendTask, getAllTasks } from '../../../../lib/tasksSheet';
import { getCanadianHolidays } from '../../../../lib/canadianHolidays';

// Vercel Cron hits this route once a day (see vercel.json). Secured with
// CRON_SECRET the same way /api/cron/create-weekly-tasks is.
export const dynamic = 'force-dynamic';

const REMINDER_DAYS_BEFORE = 7;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = todayStr();
    const currentYear = Number(today.slice(0, 4));
    const targetDate = addDays(today, REMINDER_DAYS_BEFORE);

    // Pull both this year and next year's holiday lists so a reminder for a
    // holiday just after New Year's (e.g. reminder date landing in December)
    // still gets matched correctly.
    const holidays = [...getCanadianHolidays(currentYear), ...getCanadianHolidays(currentYear + 1)];
    const dueToday = holidays.filter((h) => h.date === targetDate);

    if (dueToday.length === 0) {
      return NextResponse.json({ success: true, created: [], message: 'No holiday is 7 days out today.' });
    }

    // Safety dedupe in case the cron fires more than once on the same day,
    // or already ran for this holiday for some other reason.
    const existingTasks = await getAllTasks();
    const created = [];

    for (const holiday of dueToday) {
      const taskTitle = `🎉 ${holiday.name} 홀리데이 디자인 준비`;
      const alreadyExists = existingTasks.some(
        (t) => t.taskTitle === taskTitle && t.dueDate === holiday.date
      );
      if (alreadyExists) continue;

      const task = await appendTask({
        client: 'Holiday',
        taskTitle,
        taskDescription: `${holiday.date} ${holiday.name}을 위한 홀리데이 테마 소셜/디자인 콘텐츠를 준비해주세요.`,
        assignedTo: '슬기',
        dueDate: holiday.date,
      });
      created.push(task.taskTitle);
    }

    return NextResponse.json({ success: true, created });
  } catch (err) {
    console.error('GET /api/cron/holiday-reminders error:', err);
    return NextResponse.json(
      { error: 'Failed to create holiday reminder tasks', detail: err.message },
      { status: 500 }
    );
  }
}

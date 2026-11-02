// Weekly recurring tasks, auto-created every Monday by /api/cron/create-weekly-tasks.
// Add or remove entries here as retainer clients change — no other code needs to change.
//
// Also see RECURRING_MONTHLY_TASKS below, created on the 1st of each month
// by /api/cron/create-monthly-tasks.

export const RECURRING_WEEKLY_TASKS = [
  {
    client: 'WOLHA',
    taskTitle: '주간 인스타그램 디자인',
    taskDescription: '이번 주 인스타그램 포스트 디자인 3장 제작',
    links: ['https://canva.link/gwjdqihade9ia43'],
    assignedTo: '경민',
  },
];

// Monthly recurring tasks, auto-created on the 1st of each month by
// /api/cron/create-monthly-tasks.
export const RECURRING_MONTHLY_TASKS = [
  {
    client: 'Agora',
    taskTitle: '📊 Meta Business Suite 콘텐츠 CSV 추출',
    taskDescription:
      '지난달 Instagram 콘텐츠 인사이트 CSV 내보내기\n\n' +
      '1. Meta Business Suite 접속\n' +
      '2. Insights → Content → Export data (CSV) 클릭\n' +
      '3. 액세스 권한 있는 계정만 선택해서 추출\n' +
      '4. Facebook은 제외하고 Instagram만 체크\n' +
      '5. CSV 다운로드 후 업로드',
    links: [],
    assignedTo: '경민',
  },
];

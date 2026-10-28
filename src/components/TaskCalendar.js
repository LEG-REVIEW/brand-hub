'use client';

import { useMemo, useState } from 'react';
import { parseAssignees, getTeamMemberColor } from '../lib/teamMembers';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MAX_CHIPS = 3;

// Month calendar of tasks. A task sits on its due date; tasks without a due
// date sit on their start date (shown lighter). Clicking a chip opens the
// same task modal as the board.
export default function TaskCalendar({ tasks, statusColors, isMobile, onSelect }) {
  const now = new Date();
  const [mode, setMode] = useState('month'); // 'month' | 'week'
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [selectedDay, setSelectedDay] = useState(ymd(now));
  const [expandedDay, setExpandedDay] = useState(null);
  const todayKey = ymd(now);

  const byDay = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      const hasDue = DATE_RE.test(t.dueDate || '');
      const key = hasDue ? t.dueDate : DATE_RE.test(t.startDate || '') ? t.startDate : null;
      if (!key) continue;
      (map[key] = map[key] || []).push({ ...t, _noDue: !hasDue });
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  if (mode === 'month') {
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
  } else {
    const weekStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
    for (let i = 0; i < 7; i++) cells.push(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  }
  const weekEnd = mode === 'week' ? cells[6] : null;
  const title =
    mode === 'month'
      ? `${year}년 ${month + 1}월`
      : `${cells[0].getMonth() + 1}월 ${cells[0].getDate()}일 – ${weekEnd.getMonth() + 1}월 ${weekEnd.getDate()}일`;
  const step = (dir) =>
    setCursor(
      mode === 'month'
        ? new Date(year, month + dir, 1)
        : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7 * dir)
    );

  const navBtn = {
    border: '1px solid #ddd',
    background: '#fff',
    borderRadius: 8,
    padding: '5px 12px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
    color: '#555',
  };

  const chip = (t) => {
    const first = parseAssignees(t.assignedTo)[0];
    const done = t.status === 'completed';
    const overdue = !done && !t._noDue && t.dueDate < todayKey;
    return (
      <div
        key={t.id}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(t);
        }}
        title={`${t.client} · ${t.taskTitle}${t.assignedTo ? ` (${t.assignedTo})` : ''}`}
        style={{
          fontSize: 11,
          lineHeight: 1.3,
          padding: '2px 6px',
          marginBottom: 3,
          borderRadius: 5,
          cursor: 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          background: overdue ? '#fbeceb' : '#fff',
          borderLeft: `3px solid ${first ? getTeamMemberColor(first) : '#ccc'}`,
          boxShadow: '0 0 0 1px #eee',
          color: done ? '#aaa' : overdue ? '#b4493c' : t._noDue ? '#888' : '#333',
          textDecoration: done ? 'line-through' : 'none',
          opacity: t._noDue ? 0.8 : 1,
        }}
      >
        <span style={{ fontWeight: 700 }}>{t.client}</span> {t.taskTitle}
      </div>
    );
  };

  const selectedList = byDay[selectedDay] || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={navBtn} onClick={() => step(-1)}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 700, minWidth: 110, textAlign: 'center' }}>{title}</div>
        <button style={navBtn} onClick={() => step(1)}>›</button>
        <button
          style={{ ...navBtn, marginLeft: 4 }}
          onClick={() => {
            setCursor(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
            setSelectedDay(todayKey);
          }}
        >
          오늘
        </button>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #ddd', marginLeft: 4 }}>
          {[['month', '월'], ['week', '주']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              style={{ padding: '5px 12px', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === k ? '#1a1a1a' : '#fff', color: mode === k ? '#fff' : '#888' }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>마감일 기준 · 마감일이 없으면 시작일</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile && mode === 'week' ? 'minmax(0, 1fr)' : 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {!(isMobile && mode === 'week') && DOW.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#c97b63' : '#999', padding: '4px 0' }}>
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const key = ymd(date);
          const list = byDay[key] || [];
          const isToday = key === todayKey;
          const isSel = key === selectedDay;
          const expanded = expandedDay === key;
          const isWeek = mode === 'week';
          const shown = isMobile && !isWeek ? [] : isWeek || expanded ? list : list.slice(0, MAX_CHIPS);
          return (
            <div
              key={key}
              onClick={() => setSelectedDay(key)}
              style={{
                minHeight: isWeek ? (isMobile ? 56 : 320) : isMobile ? 48 : 104,
                minWidth: 0,
                padding: 5,
                borderRadius: 8,
                background: isSel ? '#faf7f0' : '#fff',
                border: isToday ? '2px solid #8FA8C8' : isSel ? '1px solid #C8B89A' : '1px solid #eee',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? '#3768AB' : date.getDay() === 0 ? '#c97b63' : '#777', marginBottom: 3 }}>
                {date.getDate()}
                {(mode === 'week') && <span style={{ fontWeight: 500, color: '#aaa' }}> ({DOW[date.getDay()]})</span>}
              </div>
              {shown.map(chip)}
              {!isMobile && !isWeek && list.length > MAX_CHIPS && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedDay(expanded ? null : key);
                  }}
                  style={{ fontSize: 10, color: '#3768AB', fontWeight: 600, cursor: 'pointer' }}
                >
                  {expanded ? '접기' : `+${list.length - MAX_CHIPS}개 더`}
                </div>
              )}
              {isMobile && !isWeek && list.length > 0 && (
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {list.slice(0, 4).map((t) => (
                    <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[t.status] || '#bbb' }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isMobile && mode === 'month' && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#999', marginBottom: 6 }}>{selectedDay}</div>
          {selectedList.length ? selectedList.map(chip) : <div style={{ fontSize: 12, color: '#bbb' }}>이 날은 태스크가 없어요.</div>}
        </div>
      )}
    </div>
  );
}

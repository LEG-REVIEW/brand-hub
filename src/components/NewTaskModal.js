'use client';

import { useState } from 'react';
import ClientSelect from './ClientSelect';
import { TEAM_MEMBERS, getTeamMemberColor, hasAssignee, toggleAssignee } from '../lib/teamMembers';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewTaskModal({ onClose, onCreated, clientOptions, isMobile }) {
  const [client, setClient] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [linksText, setLinksText] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [startDate, setStartDate] = useState(todayStr()); // auto-filled with today, like a calendar event
  const [dueDate, setDueDate] = useState('');
  const [showDueDate, setShowDueDate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!taskTitle.trim()) {
      alert('태스크 제목을 입력해주세요.');
      return;
    }
    if (dueDate && startDate && dueDate < startDate) {
      alert('마감일은 시작일 이후로 지정해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const links = linksText.split('\n').map((l) => l.trim()).filter(Boolean);

      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, taskTitle, taskDescription, links, assignedTo, startDate, dueDate }),
      });

      onCreated();
    } catch (err) {
      console.error('Failed to create task:', err);
      alert('태스크 생성에 실패했어요. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const openScreenshotFolder = async () => {
    if (!taskTitle.trim()) {
      alert('폴더를 만들려면 태스크 제목을 먼저 입력해주세요.');
      return;
    }
    try {
      const res = await fetch('/api/ensure-task-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, taskTitle, folderType: 'screenshots' }),
      });
      const data = await res.json();
      if (data.folderUrl) window.open(data.folderUrl, '_blank');
      else alert('폴더 링크를 가져오지 못했어요.');
    } catch (err) {
      console.error('Failed to open screenshot folder:', err);
      alert('폴더 열기에 실패했어요.');
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 200 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: isMobile ? '100%' : 480, maxHeight: isMobile ? '90vh' : '85vh', overflowY: 'auto', borderRadius: isMobile ? '16px 16px 0 0' : 16, padding: 20 }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>+ New Task</div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>스크린샷</label>
        <button
          type="button"
          onClick={openScreenshotFolder}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 0',
            marginTop: 4,
            marginBottom: 12,
            borderRadius: 8,
            border: '1px dashed #C8B89A',
            background: '#faf7f0',
            color: '#8FA8C8',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📎 스크린샷 폴더 열기 (Drive에 드래그 앤 드롭)
        </button>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>클라이언트</label>
        <ClientSelect value={client} onChange={setClient} options={clientOptions || []} />

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>태스크 제목</label>
        <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="예: 메뉴 사진 3장 새로 촬영 요청" style={inputStyle} />

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>상세 설명</label>
        <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>날짜</label>
        <div style={{ marginTop: 4, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
            />
            {showDueDate && (
              <>
                <span style={{ color: '#999', fontSize: 13 }}>→</span>
                <input
                  type="date"
                  value={dueDate}
                  min={startDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDueDate(v && startDate && v < startDate ? startDate : v);
                  }}
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setDueDate('');
                    setShowDueDate(false);
                  }}
                  style={{ border: 'none', background: 'none', color: '#C97B63', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
                >
                  ×
                </button>
              </>
            )}
          </div>
          {!showDueDate && (
            <button
              type="button"
              onClick={() => setShowDueDate(true)}
              style={{
                marginTop: 8,
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px dashed #ccc',
                background: '#fff',
                color: '#888',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + 마감일 추가
            </button>
          )}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>담당자 (여러 명 선택 가능)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, marginBottom: 12 }}>
          {TEAM_MEMBERS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setAssignedTo(toggleAssignee(assignedTo, name))}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: hasAssignee(assignedTo, name) ? `2px solid ${getTeamMemberColor(name)}` : '1px solid #ddd',
                background: hasAssignee(assignedTo, name) ? getTeamMemberColor(name) : '#fff',
                color: hasAssignee(assignedTo, name) ? '#fff' : '#333',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>링크 (한 줄에 하나씩)</label>
        <textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} rows={2} placeholder="https://..." style={{ ...inputStyle, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 14, cursor: 'pointer' }}>
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#C8B89A', color: '#1a1a1a', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {submitting ? '생성 중...' : '태스크 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  fontSize: 14,
  marginBottom: 12,
  marginTop: 4,
  boxSizing: 'border-box',
};

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import NewTaskModal from './NewTaskModal';
import { clients } from '../app/clients';
import { TEAM_MEMBERS, getTeamMemberColor, hasAssignee, toggleAssignee, parseAssignees } from '../lib/teamMembers';
import { isBlobRef, blobRefToUrl } from '../lib/attachments';

const OFFICIAL_CLIENT_NAMES = clients.filter((c) => c.active).map((c) => c.name);

const CLIENT_BADGE_COLOR = '#E3F2FA'; // pale sky blue, same for every client
const CLIENT_BADGE_TEXT_COLOR = '#3B7C99';

const STATUSES = [
  { key: 'not_started', label: 'Not Started', color: '#C8B89A' },
  { key: 'in_progress', label: 'In Progress', color: '#8FA8C8' },
  { key: 'needs_review', label: 'Needs Review', color: '#D8B26A' },
  { key: 'needs_changes', label: 'Needs Changes', color: '#C97B63' },
  { key: 'completed', label: 'Completed', color: '#B7C9A8' },
];

const POLL_INTERVAL_MS = 12000;

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'America/Vancouver',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  try {
    // dateStr is a plain YYYY-MM-DD from <input type="date">; parse as local, not UTC.
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatDateRange(task) {
  if (!task.startDate && !task.dueDate) return '';
  if (task.dueDate && task.dueDate !== task.startDate) {
    return `${formatDueDate(task.startDate)} → ${formatDueDate(task.dueDate)}`;
  }
  return formatDueDate(task.startDate || task.dueDate);
}

function isOverdue(task) {
  if (!task.dueDate || task.status === 'completed') return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return task.dueDate < todayStr;
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('not_started');
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('전체');
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [identity, setIdentity] = useState(null); // '슬기' | '경민' | '상원' | '정진' | '대니'(=대표님)
  const [newComment, setNewComment] = useState('');
  const [newLink, setNewLink] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [editingDates, setEditingDates] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState('');
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [driveImages, setDriveImages] = useState({ screenshots: [], designs: [] });
  const [loadingImages, setLoadingImages] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { images: [...], index: 0 }
  const touchStartXRef = useRef(null);
  const cardRefs = useRef({}); // taskId -> card DOM node, for drag-reorder hit testing
  const dragReorderRef = useRef(null); // { taskId, column, startY, list } while a reorder-drag is active
  const [dragVisual, setDragVisual] = useState(null); // { taskId, offsetY } — visual lift while dragging

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
      setSelectedTask((prev) => (prev ? data.tasks?.find((t) => t.id === prev.id) || prev : prev));
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  useEffect(() => {
    const checkWidth = () => setIsMobile(window.innerWidth < 768);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('brandhub_identity');
    if (saved) setIdentity(saved);
  }, []);

  // Deep link from Telegram notifications: /tasks?task=<id> opens that
  // task's modal once, as soon as the task list has loaded.
  const openedFromUrlRef = useRef(false);
  useEffect(() => {
    if (openedFromUrlRef.current || tasks.length === 0) return;
    const id = new URLSearchParams(window.location.search).get('task');
    if (!id) {
      openedFromUrlRef.current = true;
      return;
    }
    const match = tasks.find((t) => t.id === id);
    if (match) {
      setSelectedTask(match);
      openedFromUrlRef.current = true;
    }
  }, [tasks]);

  const chooseIdentity = (name) => {
    window.localStorage.setItem('brandhub_identity', name);
    setIdentity(name);
  };

  const updateStatus = async (task, newStatus) => {
    if (!task || task.status === newStatus) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    setSelectedTask((prev) => (prev?.id === task.id ? { ...prev, status: newStatus } : prev));
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: task.rowIndex, status: newStatus }),
      });
      fetchTasks();
    } catch (err) {
      console.error('Failed to update status:', err);
      fetchTasks();
    }
  };

  const patchTask = async (task, updates) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: task.rowIndex, ...updates }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('PATCH failed:', data);
        alert(`업데이트 실패: ${data.detail || data.error}`);
        return false;
      }
      fetchTasks();
      return true;
    } catch (err) {
      console.error('Failed to patch task:', err);
      alert('업데이트에 실패했어요. 다시 시도해주세요.');
      return false;
    }
  };

  const submitComment = async (task) => {
    if (!newComment.trim()) return;
    const author = identity || '익명';
    const ok = await patchTask(task, { appendComment: `${author}: ${newComment.trim()}` });
    if (ok) setNewComment('');
  };

  const submitLink = async (task) => {
    if (!newLink.trim()) return;
    await patchTask(task, { links: [...task.links, newLink.trim()] });
    setNewLink('');
  };

  const removeLink = async (task, link) => {
    await patchTask(task, { links: task.links.filter((l) => l !== link) });
  };

  const saveTitle = async (task) => {
    if (!titleDraft.trim()) return;
    const ok = await patchTask(task, { taskTitle: titleDraft.trim() });
    if (ok) setEditingTitle(false);
  };

  const saveDescription = async (task) => {
    const ok = await patchTask(task, { taskDescription: descDraft });
    if (ok) setEditingDesc(false);
  };

  const saveDates = async (task) => {
    if (dueDateDraft && startDateDraft && dueDateDraft < startDateDraft) {
      alert('마감일은 시작일 이후로 지정해주세요.');
      return;
    }
    const ok = await patchTask(task, { startDate: startDateDraft, dueDate: dueDateDraft });
    if (ok) setEditingDates(false);
  };

  const removeDueDateOnly = async (task) => {
    setDueDateDraft('');
  };

  const deleteTask = async (task) => {
    if (!confirm(`"${task.taskTitle}" 태스크를 삭제할까요? 되돌릴 수 없어요.`)) return;
    try {
      await fetch(`/api/tasks?rowIndex=${task.rowIndex}`, { method: 'DELETE' });
      setSelectedTask(null);
      fetchTasks();
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('삭제에 실패했어요.');
    }
  };

  const loadDriveImages = useCallback(async (task) => {
    if (!task) return;
    setLoadingImages(true);
    try {
      const dateStr = task.createdAt ? task.createdAt.slice(0, 10) : undefined;
      const [screenshotsRes, designsRes] = await Promise.all([
        fetch('/api/list-task-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client: task.client, taskTitle: task.taskTitle, dateStr, folderType: 'screenshots' }),
        }).then((r) => r.json()),
        fetch('/api/list-task-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client: task.client, taskTitle: task.taskTitle, dateStr, folderType: 'designs' }),
        }).then((r) => r.json()),
      ]);
      setDriveImages({ screenshots: screenshotsRes.images || [], designs: designsRes.images || [] });
    } catch (err) {
      console.error('Failed to list drive images:', err);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTask) loadDriveImages(selectedTask);
  }, [selectedTask?.id]);

  const openDriveFolder = async (task, folderType) => {
    try {
      const res = await fetch('/api/ensure-task-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: task.client,
          taskTitle: task.taskTitle,
          folderType,
          dateStr: task.createdAt ? task.createdAt.slice(0, 10) : undefined,
        }),
      });
      const data = await res.json();
      if (data.folderUrl) window.open(data.folderUrl, '_blank');
      else alert('폴더 링크를 가져오지 못했어요.');
    } catch (err) {
      console.error('Failed to open drive folder:', err);
      alert('폴더 열기에 실패했어요.');
    }
  };

  const ARCHIVE_AFTER_DAYS = 7;

  const isRecentlyCompleted = (task) => {
    if (!task.updatedAt) return true; // no timestamp, don't hide it
    const ageMs = Date.now() - new Date(task.updatedAt).getTime();
    return ageMs < ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  };

  const matchesSearch = (task) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      task.client.toLowerCase().includes(q) ||
      task.taskTitle.toLowerCase().includes(q) ||
      task.taskDescription.toLowerCase().includes(q)
    );
  };

  const columnTasks = (statusKey) =>
    tasks
      .filter((t) => {
        if (t.status !== statusKey) return false;
        if (!matchesSearch(t)) return false;
        if (assigneeFilter !== '전체' && !hasAssignee(t.assignedTo, assigneeFilter)) return false;
        // Completed tasks older than a week are hidden from the board view
        // (still findable via search above) to keep that column from piling up.
        if (statusKey === 'completed' && !searchQuery.trim() && !isRecentlyCompleted(t)) return false;
        return true;
      })
      // Manual card order within a column. Legacy rows without a sortOrder
      // (value 0) fall back to their sheet row order relative to each other.
      .sort((a, b) => (a.sortOrder || a.rowIndex) - (b.sortOrder || b.rowIndex));

  const patchSortOrder = (rowIndex, sortOrder) =>
    fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex, sortOrder }),
    });

  // Re-assigns sortOrder sequentially to every task in `newOrder` (the full
  // column, already in its new order) and PATCHes only the ones that
  // actually changed. Reassigning the whole column — rather than swapping
  // two values — is what makes this safe for legacy rows that all share
  // sortOrder 0: a swap between two 0s is a no-op, a full reassign isn't.
  const commitReorder = async (newOrder) => {
    const updated = newOrder.map((t, i) => ({ ...t, sortOrder: (i + 1) * 1000 }));
    setTasks((prev) => {
      const byId = Object.fromEntries(updated.map((t) => [t.id, t]));
      return prev.map((t) => byId[t.id] || t);
    });
    try {
      await Promise.all(
        updated
          .filter((t, i) => t.sortOrder !== newOrder[i].sortOrder)
          .map((t) => patchSortOrder(t.rowIndex, t.sortOrder))
      );
      fetchTasks();
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
      fetchTasks();
    }
  };

  // Drag-handle pointer handlers (mouse AND touch — Completed cards never
  // get a handle, see renderCard). The handle captures the pointer so move/up
  // events keep firing even if the finger/cursor leaves the handle itself.
  const handleReorderPointerDown = (e, task) => {
    if (task.status === 'completed') return;
    e.preventDefault();
    e.stopPropagation();
    const list = columnTasks(task.status);
    dragReorderRef.current = { taskId: task.id, column: task.status, startY: e.clientY, list };
    setDragVisual({ taskId: task.id, offsetY: 0 });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — not critical if capture isn't supported
    }
  };

  const handleReorderPointerMove = (e) => {
    const drag = dragReorderRef.current;
    if (!drag) return;
    setDragVisual({ taskId: drag.taskId, offsetY: e.clientY - drag.startY });
  };

  const endReorderDrag = (e) => {
    const drag = dragReorderRef.current;
    dragReorderRef.current = null;
    setDragVisual(null);
    if (!drag) return;

    const { taskId, list } = drag;
    const finalY = e.clientY;
    const draggedTask = list.find((t) => t.id === taskId);
    if (!draggedTask) return;

    const others = list.filter((t) => t.id !== taskId);
    let insertAt = others.length;
    for (let i = 0; i < others.length; i++) {
      const el = cardRefs.current[others[i].id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      if (finalY < centerY) {
        insertAt = i;
        break;
      }
    }

    const newOrder = [...others];
    newOrder.splice(insertAt, 0, draggedTask);

    const unchanged = newOrder.every((t, i) => t.id === list[i]?.id);
    if (!unchanged) commitReorder(newOrder);
  };

  const renderCard = (task) => {
    const overdue = isOverdue(task);
    const reorderable = task.status !== 'completed';
    const beingDragged = dragVisual?.taskId === task.id;
    return (
      <div
        key={task.id}
        ref={(el) => {
          if (el) cardRefs.current[task.id] = el;
          else delete cardRefs.current[task.id];
        }}
        draggable={!isMobile}
        onDragStart={(e) => {
          e.stopPropagation();
          setDraggedTaskId(task.id);
        }}
        onDragEnd={() => setDraggedTaskId(null)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const draggedTask = tasks.find((t) => t.id === draggedTaskId);
          setDraggedTaskId(null);
          if (!draggedTask || draggedTask.id === task.id) return;
          if (draggedTask.status !== task.status) updateStatus(draggedTask, task.status);
        }}
        onClick={() => {
          setSelectedTask(task);
          setEditingTitle(false);
          setEditingDesc(false);
          setEditingDates(false);
        }}
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
          background: '#fff',
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          boxShadow: beingDragged ? '0 6px 16px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          border: overdue ? '1px solid #E8B4A8' : '1px solid #eee',
          opacity: draggedTaskId === task.id ? 0.4 : 1,
          transform: beingDragged ? `translateY(${dragVisual.offsetY}px)` : undefined,
          position: beingDragged ? 'relative' : undefined,
          zIndex: beingDragged ? 50 : undefined,
          transition: beingDragged ? 'none' : 'box-shadow 0.1s',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 700,
                color: CLIENT_BADGE_TEXT_COLOR,
                background: CLIENT_BADGE_COLOR,
                padding: '3px 9px',
                borderRadius: 20,
              }}
            >
              {task.client}
            </div>
            {(() => {
              const names = parseAssignees(task.assignedTo);
              if (names.length === 0) return null;
              // One assignee: name pill. Several: compact overlapping initials
              // so the badge row doesn't wrap onto a second line.
              if (names.length === 1) {
                return (
                  <div
                    style={{
                      display: 'inline-block',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fff',
                      background: getTeamMemberColor(names[0]),
                      padding: '3px 9px',
                      borderRadius: 20,
                    }}
                  >
                    👤 {names[0]}
                  </div>
                );
              }
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center' }} title={names.join(', ')}>
                  {names.map((name, i) => (
                    <div
                      key={name}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: getTeamMemberColor(name),
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #fff',
                        marginLeft: i === 0 ? 0 : -6,
                        boxSizing: 'content-box',
                      }}
                    >
                      {name.charAt(0)}
                    </div>
                  ))}
                </div>
              );
            })()}
            {(task.startDate || task.dueDate) && (
              <div
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: overdue ? '#fff' : '#666',
                  background: overdue ? '#db8585' : '#f0f0f0',
                  padding: '3px 9px',
                  borderRadius: 20,
                }}
              >
                📅 {formatDateRange(task)}
              </div>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>{task.taskTitle}</div>
          {task.taskDescription && (
            <div
              style={{
                fontSize: 12,
                color: '#777',
                marginBottom: 8,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {task.taskDescription}
            </div>
          )}
          {task.links.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#888' }}>🔗 {task.links.length}</span>
            </div>
          )}
        </div>
        {reorderable && (
          <div
            onPointerDown={(e) => handleReorderPointerDown(e, task)}
            onPointerMove={handleReorderPointerMove}
            onPointerUp={endReorderDrag}
            onPointerCancel={endReorderDrag}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            draggable={false}
            title="드래그해서 순서 변경"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              color: '#ccc',
              fontSize: 16,
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            ⠿
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>✅ Tasks</h1>
        <button
          onClick={() => setShowNewTask(true)}
          style={{ padding: '8px 16px', background: '#C8B89A', color: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + New Task
        </button>
      </div>

      {identity ? (
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>
          👤 <strong style={{ color: '#666' }}>{identity}</strong>(으)로 코멘트 남기는 중 ·{' '}
          <button
            onClick={() => setIdentity(null)}
            style={{ border: 'none', background: 'none', color: '#8FA8C8', fontSize: 11, cursor: 'pointer', padding: 0 }}
          >
            바꾸기
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 14px',
            background: '#faf7f0',
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          <span style={{ color: '#666' }}>코멘트에 이름 표시하려면 선택해주세요:</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => chooseIdentity('슬기')}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #C8B89A', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              저는 슬기예요
            </button>
            <button
              onClick={() => chooseIdentity('경민')}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #E3A994', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              저는 경민이에요
            </button>
            <button
              onClick={() => chooseIdentity('상원')}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #8FA8C8', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              저는 상원이에요
            </button>
            <button
              onClick={() => chooseIdentity('정진')}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #A88BB8', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              저는 정진이에요
            </button>
            <button
              onClick={() => chooseIdentity('대니')}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #D8B26A', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              저는 대니예요
            </button>
          </div>
        </div>
      )}

      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="🔍 클라이언트, 제목, 설명으로 검색... (1주일 지난 완료 태스크도 여기서 찾아져요)"
        style={{
          width: '100%',
          padding: '9px 14px',
          borderRadius: 8,
          border: '1px solid #ddd',
          fontSize: 13,
          marginBottom: 10,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {['전체', ...TEAM_MEMBERS].map((name) => (
          <button
            key={name}
            onClick={() => setAssigneeFilter(name)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: assigneeFilter === name ? (name === '전체' ? '#8FA8C8' : getTeamMemberColor(name)) : '#f0f0f0',
              color: assigneeFilter === name ? '#fff' : '#888',
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {isMobile && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveTab(s.key)}
              style={{
                flexShrink: 0,
                padding: '8px 14px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                background: activeTab === s.key ? s.color : '#f0f0f0',
                color: activeTab === s.key ? '#1a1a1a' : '#888',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label} ({columnTasks(s.key).length})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>불러오는 중...</div>
      ) : isMobile ? (
        <div>{columnTasks(activeTab).map(renderCard)}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {STATUSES.map((s) => (
            <div
              key={s.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColumn(s.key);
              }}
              onDragLeave={() => setDragOverColumn((prev) => (prev === s.key ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const task = tasks.find((t) => t.id === draggedTaskId);
                if (task) updateStatus(task, s.key);
                setDraggedTaskId(null);
                setDragOverColumn(null);
              }}
              style={{
                background: dragOverColumn === s.key ? '#faf7f0' : 'transparent',
                borderRadius: 10,
                padding: dragOverColumn === s.key ? 6 : 0,
                minHeight: 40,
                transition: 'background 0.1s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${s.color}` }}>
                {s.label} ({columnTasks(s.key).length})
              </div>
              {columnTasks(s.key).map(renderCard)}
            </div>
          ))}
        </div>
      )}

      {showNewTask && (
        <NewTaskModal
          isMobile={isMobile}
          onClose={() => setShowNewTask(false)}
          onCreated={() => {
            setShowNewTask(false);
            fetchTasks();
          }}
          clientOptions={[...new Set([...OFFICIAL_CLIENT_NAMES, ...tasks.map((t) => t.client).filter(Boolean)])]}
        />
      )}

      {selectedTask && (
        <div
          onClick={() => setSelectedTask(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: isMobile ? '100%' : 560,
              maxHeight: isMobile ? '90vh' : '85vh',
              overflowY: 'auto',
              borderRadius: isMobile ? '16px 16px 0 0' : 16,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 12, color: '#999' }}>{selectedTask.client}</div>
              <button
                onClick={() => deleteTask(selectedTask)}
                style={{ border: 'none', background: 'none', color: '#C97B63', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                🗑 삭제
              </button>
            </div>

            {editingTitle ? (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  style={{ flex: 1, fontSize: 16, fontWeight: 700, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  autoFocus
                />
                <button onClick={() => saveTitle(selectedTask)} style={{ border: 'none', background: '#8FA8C8', color: '#fff', borderRadius: 6, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}>
                  저장
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  setTitleDraft(selectedTask.taskTitle);
                  setEditingTitle(true);
                }}
                style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, cursor: 'text' }}
              >
                {selectedTask.taskTitle} <span style={{ fontSize: 11, color: '#bbb', fontWeight: 400 }}>✏️</span>
              </div>
            )}

            {editingDesc ? (
              <div style={{ marginBottom: 10 }}>
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={3}
                  style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', boxSizing: 'border-box', marginBottom: 6 }}
                  autoFocus
                />
                <button onClick={() => saveDescription(selectedTask)} style={{ border: 'none', background: '#8FA8C8', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                  저장
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  setDescDraft(selectedTask.taskDescription || '');
                  setEditingDesc(true);
                }}
                style={{ fontSize: 13, color: '#666', marginBottom: 10, lineHeight: 1.5, cursor: 'text', whiteSpace: 'pre-wrap' }}
              >
                {selectedTask.taskDescription || <span style={{ color: '#bbb' }}>상세 설명 추가...</span>} <span style={{ fontSize: 11, color: '#bbb' }}>✏️</span>
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              {editingDates ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={startDateDraft}
                    onChange={(e) => setStartDateDraft(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}
                    autoFocus
                  />
                  {dueDateDraft ? (
                    <>
                      <span style={{ color: '#999', fontSize: 13 }}>→</span>
                      <input
                        type="date"
                        value={dueDateDraft}
                        min={startDateDraft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDueDateDraft(v && startDateDraft && v < startDateDraft ? startDateDraft : v);
                        }}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}
                      />
                      <button onClick={() => removeDueDateOnly(selectedTask)} style={{ border: 'none', background: 'none', color: '#C97B63', fontSize: 16, cursor: 'pointer', padding: '0 2px' }}>
                        ×
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDueDateDraft(startDateDraft)}
                      style={{ padding: '5px 12px', borderRadius: 20, border: '1px dashed #ccc', background: '#fff', color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      + 마감일 추가
                    </button>
                  )}
                  <button onClick={() => saveDates(selectedTask)} style={{ border: 'none', background: '#8FA8C8', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                    저장
                  </button>
                </div>
              ) : selectedTask.startDate || selectedTask.dueDate ? (
                <div
                  onClick={() => {
                    setStartDateDraft(selectedTask.startDate || '');
                    setDueDateDraft(selectedTask.dueDate || '');
                    setEditingDates(true);
                  }}
                  style={{
                    display: 'inline-block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: isOverdue(selectedTask) ? '#fff' : '#666',
                    background: isOverdue(selectedTask) ? '#db8585' : '#f0f0f0',
                    padding: '4px 10px',
                    borderRadius: 20,
                    cursor: 'pointer',
                  }}
                >
                  📅 {formatDateRange(selectedTask)} {isOverdue(selectedTask) ? '(지남)' : ''}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setStartDateDraft(new Date().toISOString().slice(0, 10));
                    setDueDateDraft('');
                    setEditingDates(true);
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    border: '1px dashed #ccc',
                    background: '#fff',
                    color: '#888',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + 날짜 추가
                </button>
              )}
            </div>

            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 14 }}>
              생성: {formatDate(selectedTask.createdAt)} · 수정: {formatDate(selectedTask.updatedAt)}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => updateStatus(selectedTask, s.key)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 20,
                    border: selectedTask.status === s.key ? `2px solid ${s.color}` : '1px solid #ddd',
                    background: selectedTask.status === s.key ? s.color : '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 6 }}>👤 담당자 (여러 명 선택 가능)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEAM_MEMBERS.map((name) => (
                  <button
                    key={name}
                    onClick={() =>
                      patchTask(selectedTask, { assignedTo: toggleAssignee(selectedTask.assignedTo, name) })
                    }
                    style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: hasAssignee(selectedTask.assignedTo, name) ? `2px solid ${getTeamMemberColor(name)}` : '1px solid #ddd',
                      background: hasAssignee(selectedTask.assignedTo, name) ? getTeamMemberColor(name) : '#fff',
                      color: hasAssignee(selectedTask.assignedTo, name) ? '#fff' : '#333',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {(selectedTask.screenshotImageIds || []).filter(isBlobRef).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 6 }}>📎 텔레그램 첨부 사진</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                  {(() => {
                    const imgs = selectedTask.screenshotImageIds
                      .filter(isBlobRef)
                      .map((ref, i) => ({ id: ref, name: `첨부 ${i + 1}`, thumbnailUrl: blobRefToUrl(ref) }));
                    return imgs.map((img, i) => (
                      <img
                        key={img.id}
                        src={img.thumbnailUrl}
                        alt={img.name}
                        onClick={() => setLightbox({ images: imgs, index: i })}
                        style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                      />
                    ));
                  })()}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#999' }}>📷 SCREENSHOTS</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => loadDriveImages(selectedTask)} style={{ border: 'none', background: 'none', color: '#999', fontSize: 11, cursor: 'pointer' }}>
                    🔄 새로고침
                  </button>
                  <button onClick={() => openDriveFolder(selectedTask, 'screenshots')} style={{ border: 'none', background: 'none', color: '#3768AB', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    📁 여기에 사진 추가하기
                  </button>
                </div>
              </div>
              {loadingImages ? (
                <div style={{ fontSize: 12, color: '#bbb' }}>불러오는 중...</div>
              ) : driveImages.screenshots.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                  {driveImages.screenshots.map((img, i) => (
                    <img
                      key={img.id}
                      src={img.thumbnailUrl}
                      alt={img.name}
                      onClick={() => setLightbox({ images: driveImages.screenshots, index: i })}
                      style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#bbb' }}>아직 없어요. &quot;여기에 사진 추가하기&quot;로 Drive 폴더 열어서 넣어주세요.</div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#999' }}>🎨 DESIGNS</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => loadDriveImages(selectedTask)} style={{ border: 'none', background: 'none', color: '#999', fontSize: 11, cursor: 'pointer' }}>
                    🔄 새로고침
                  </button>
                  <button onClick={() => openDriveFolder(selectedTask, 'designs')} style={{ border: 'none', background: 'none', color: '#3768AB', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    📁 여기에 디자인 추가하기
                  </button>
                </div>
              </div>
              {loadingImages ? (
                <div style={{ fontSize: 12, color: '#bbb' }}>불러오는 중...</div>
              ) : driveImages.designs.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                  {driveImages.designs.map((img, i) => (
                    <img
                      key={img.id}
                      src={img.thumbnailUrl}
                      alt={img.name}
                      onClick={() => setLightbox({ images: driveImages.designs, index: i })}
                      style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#bbb' }}>아직 없어요. &quot;여기에 디자인 추가하기&quot;로 Drive 폴더 열어서 넣어주세요.</div>
              )}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 6 }}>🔗 LINKS</div>
            {selectedTask.links.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {selectedTask.links.map((link) => (
                  <div key={link} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#3768AB', wordBreak: 'break-all', flex: 1 }}>
                      {link}
                    </a>
                    <button onClick={() => removeLink(selectedTask, link)} style={{ border: 'none', background: 'none', color: '#C97B63', cursor: 'pointer', fontSize: 12 }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                placeholder="https://..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}
              />
              <button
                onClick={() => submitLink(selectedTask)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#8FA8C8', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                추가
              </button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 6 }}>💬 COMMENTS</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="피드백/코멘트 추가..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}
              />
              <button
                onClick={() => submitComment(selectedTask)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#8FA8C8', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                추가
              </button>
            </div>
            {selectedTask.comments && (
              <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedTask.comments}</div>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          onTouchStart={(e) => {
            touchStartXRef.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchStartXRef.current == null) return;
            const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
            const SWIPE_THRESHOLD = 50;
            if (deltaX > SWIPE_THRESHOLD) {
              setLightbox((prev) =>
                prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : prev
              );
            } else if (deltaX < -SWIPE_THRESHOLD) {
              setLightbox((prev) => (prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : prev));
            }
            touchStartXRef.current = null;
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
          }}
        >
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 20,
              border: 'none',
              background: 'none',
              color: '#fff',
              fontSize: 28,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>

          {lightbox.images.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((prev) =>
                  prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : prev
                );
              }}
              style={{
                position: 'absolute',
                left: 12,
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: 22,
                width: 40,
                height: 40,
                borderRadius: '50%',
                cursor: 'pointer',
              }}
            >
              ‹
            </button>
          )}

          <img
            onClick={(e) => e.stopPropagation()}
            src={lightbox.images[lightbox.index].thumbnailUrl.replace('&sz=w400', '&sz=w1600')}
            alt={lightbox.images[lightbox.index].name}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }}
          />

          {lightbox.images.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((prev) => (prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : prev));
              }}
              style={{
                position: 'absolute',
                right: 12,
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: 22,
                width: 40,
                height: 40,
                borderRadius: '50%',
                cursor: 'pointer',
              }}
            >
              ›
            </button>
          )}

          {lightbox.images.length > 1 && (
            <div style={{ position: 'absolute', bottom: 20, color: '#fff', fontSize: 12 }}>
              {lightbox.index + 1} / {lightbox.images.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

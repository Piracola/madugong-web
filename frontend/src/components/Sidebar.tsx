import type { ChatSession } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentUserId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}

export default function Sidebar({
  sessions,
  currentSessionId,
  currentUserId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div>
          <span className="panel-tag">对话历史</span>
          <h2>历史记录</h2>
        </div>
        <button className="new-chat-btn" onClick={onNewSession}>
          新对话
        </button>
      </div>
      <ul className="session-list">
        {sessions.length === 0 && (
          <li className="session-empty">还没有对话记录，点击右上角开始第一轮提问。</li>
        )}
        {sessions.map(session => {
          const isOwner = session.ownerId === currentUserId;

          return (
            <li key={session.id} className="session-row">
              <button
                type="button"
                className={[
                  'session-item',
                  session.id === currentSessionId ? 'session-item--active' : '',
                  session.isLocked ? 'session-item--locked' : '',
                  !isOwner ? 'session-item--readonly' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onSelectSession(session.id)}
              >
                <div className="session-content">
                  <span className="session-title">{session.title}</span>
                  <div className="session-badges">
                    {!isOwner && <span className="session-badge session-badge--readonly">只读</span>}
                    {session.isLocked && <span className="session-badge session-badge--locked">已完成</span>}
                  </div>
                </div>
                <span className="session-open" aria-hidden="true">↗</span>
              </button>
              {isOwner && (
                <button
                  type="button"
                  className="session-delete"
                  onClick={() => onDeleteSession(session.id)}
                  aria-label="删除对话"
                  title="删除对话"
                >
                  删除
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

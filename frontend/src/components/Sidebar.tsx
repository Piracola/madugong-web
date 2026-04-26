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
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>历史记录</h2>
        <button className="new-chat-btn" onClick={onNewSession}>
          + 新对话
        </button>
      </div>
      <ul className="session-list">
        {sessions.map(session => {
          const isOwner = session.ownerId === currentUserId;

          return (
            <li
              key={session.id}
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
                  {session.isLocked && <span className="session-badge session-badge--locked">已封锁</span>}
                </div>
              </div>
              <button
                className="session-delete"
                onClick={e => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                aria-label={isOwner ? '删除对话' : '禁止删除其他用户创建的对话'}
                title={isOwner ? '删除对话' : '只允许删除自己创建的历史记录'}
                disabled={!isOwner}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

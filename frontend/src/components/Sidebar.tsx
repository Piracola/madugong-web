import type { ChatSession } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}

export default function Sidebar({
  sessions,
  currentSessionId,
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
        {sessions.map(session => (
          <li
            key={session.id}
            className={`session-item ${session.id === currentSessionId ? 'session-item--active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <span className="session-title">{session.title}</span>
            <button
              className="session-delete"
              onClick={e => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              aria-label="删除对话"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

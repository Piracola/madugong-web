import { useState, useRef, useEffect, useCallback } from 'react';
import MessageBubble from './components/MessageBubble';
import ChatInput from './components/ChatInput';
import Sidebar from './components/Sidebar';
import { sendChat } from './api';
import type { ChatMessage, ChatSession } from './types';

const STORAGE_KEY = 'mdg_chat_sessions';
const USER_STORAGE_KEY = 'mdg_chat_user_id';
const MAX_SESSIONS = 50;
const MOBILE_BREAKPOINT = 960;

let nextId = 0;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getInitialSidebarOpen() {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.innerWidth > MOBILE_BREAKPOINT;
}

function getOrCreateUserId(): string {
  try {
    const existingId = localStorage.getItem(USER_STORAGE_KEY);
    if (existingId) {
      return existingId;
    }

    const newId = globalThis.crypto?.randomUUID?.() ?? generateId();
    localStorage.setItem(USER_STORAGE_KEY, newId);
    return newId;
  } catch {
    return 'local-user';
  }
}

function getSessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(message => message.role === 'user');
  if (firstUser) {
    return firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '...' : '');
  }
  return '新对话';
}

function loadSessions(currentUserId: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((session): ChatSession => {
          const messages = Array.isArray(session?.messages) ? session.messages : [];
          const hasUserMessage = messages.some(
            (message: ChatMessage) => message.role === 'user',
          );
          const hasPendingAssistantMessage = messages.some(
            (message: ChatMessage) => message.role === 'assistant' && message.isStreaming === true,
          );

          return {
            id: typeof session?.id === 'string' ? session.id : generateId(),
            title: typeof session?.title === 'string' && session.title.trim() ? session.title : '新对话',
            messages,
            createdAt: typeof session?.createdAt === 'number' ? session.createdAt : Date.now(),
            updatedAt: typeof session?.updatedAt === 'number' ? session.updatedAt : Date.now(),
            ownerId: typeof session?.ownerId === 'string' && session.ownerId.trim() ? session.ownerId : currentUserId,
            isLocked: session?.isLocked === true || (hasUserMessage && !hasPendingAssistantMessage),
          };
        });
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    // ignore
  }
}

export default function App() {
  const currentUserId = useRef(getOrCreateUserId()).current;
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions(currentUserId));
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find(session => session.id === currentSessionId) || null;
  const messages = currentSession?.messages || [];
  const isCurrentSessionReadOnly = Boolean(currentSession && currentSession.ownerId !== currentUserId);
  const isCurrentSessionLocked = Boolean(currentSession?.isLocked);
  const isInputDisabled = isStreaming || isCurrentSessionLocked || isCurrentSessionReadOnly;
  const inputPlaceholder = isCurrentSessionReadOnly
    ? '该历史记录不是你创建的，仅支持查看'
    : isCurrentSessionLocked
      ? '该历史记录已完成一轮对话，请新建对话'
      : '有问题，尽管问';

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsSidebarOpen(!event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const closeSidebarOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT) {
      setIsSidebarOpen(false);
    }
  }, []);

  const handleNewSession = useCallback(() => {
    const emptySession = sessions.find(
      session => session.ownerId === currentUserId && session.messages.length === 0 && !session.isLocked,
    );
    if (emptySession) {
      setCurrentSessionId(emptySession.id);
      closeSidebarOnMobile();
      return;
    }

    const newSession: ChatSession = {
      id: generateId(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ownerId: currentUserId,
      isLocked: false,
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    closeSidebarOnMobile();
  }, [closeSidebarOnMobile, currentUserId, sessions]);

  const handleSelectSession = useCallback((id: string) => {
    setCurrentSessionId(id);
    closeSidebarOnMobile();
  }, [closeSidebarOnMobile]);

  const handleDeleteSession = useCallback((id: string) => {
    const targetSession = sessions.find(session => session.id === id);
    if (!targetSession || targetSession.ownerId !== currentUserId) {
      return;
    }

    const remainingSessions = sessions.filter(session => session.id !== id);
    setSessions(remainingSessions);
    setCurrentSessionId(prev => (prev === id ? remainingSessions[0]?.id ?? null : prev));
  }, [currentUserId, sessions]);

  const handleSend = useCallback((text: string) => {
    if (isStreaming || isCurrentSessionLocked || isCurrentSessionReadOnly) {
      return;
    }

    const userMsg: ChatMessage = {
      id: String(nextId++),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: String(nextId++),
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    };

    let targetSessionId = currentSessionId;
    const requestMessages = [{ role: userMsg.role, content: userMsg.content }];

    if (!targetSessionId) {
      const newSession: ChatSession = {
        id: generateId(),
        title: text.slice(0, 20) + (text.length > 20 ? '...' : ''),
        messages: [userMsg, assistantMsg],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: currentUserId,
        isLocked: false,
      };
      targetSessionId = newSession.id;
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
    } else {
      setSessions(prev =>
        prev.map(session =>
          session.id === targetSessionId
            ? {
                ...session,
                messages: [...session.messages, userMsg, assistantMsg],
                updatedAt: Date.now(),
                title: session.title === '新对话' ? getSessionTitle([...session.messages, userMsg]) : session.title,
                isLocked: false,
              }
            : session,
        ),
      );
    }

    setIsStreaming(true);

    sendChat(
      requestMessages,
      (chunk: string) => {
        setSessions(prev =>
          prev.map(session =>
            session.id === targetSessionId
              ? {
                  ...session,
                  messages: session.messages.map(message =>
                    message.id === assistantMsg.id
                      ? { ...message, content: message.content + chunk }
                      : message,
                  ),
                  updatedAt: Date.now(),
                  isLocked: false,
                }
              : session,
          ),
        );
      },
      () => {
        setSessions(prev =>
          prev.map(session =>
            session.id === targetSessionId
              ? {
                  ...session,
                  messages: session.messages.map(message =>
                    message.id === assistantMsg.id
                      ? { ...message, isStreaming: false }
                      : message,
                  ),
                  updatedAt: Date.now(),
                  isLocked: true,
                }
              : session,
          ),
        );
        setIsStreaming(false);
      },
      (err: string) => {
        setSessions(prev =>
          prev.map(session =>
            session.id === targetSessionId
              ? {
                  ...session,
                  messages: session.messages.map(message =>
                    message.id === assistantMsg.id
                      ? { ...message, content: err, isStreaming: false, isError: true }
                      : message,
                  ),
                  updatedAt: Date.now(),
                  isLocked: true,
                }
              : session,
          ),
        );
        setIsStreaming(false);
      },
    );
  }, [currentSessionId, currentUserId, isCurrentSessionLocked, isCurrentSessionReadOnly, isStreaming]);

  return (
    <div className={`app-shell${isSidebarOpen ? ' app-shell--sidebar-open' : ''}`}>
      <aside className="app-sidebar" aria-label="历史记录面板">
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          currentUserId={currentUserId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />
      </aside>

      <button
        type="button"
        className="app-overlay"
        aria-label="关闭侧边栏"
        onClick={() => setIsSidebarOpen(false)}
      />

      <section className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button
              type="button"
              className="topbar-menu"
              aria-label={isSidebarOpen ? '收起侧边栏' : '展开侧边栏'}
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen(prev => !prev)}
            >
              <span />
              <span />
              <span />
            </button>
            <h1 className="topbar__title">马督工</h1>
          </div>
        </header>

        <div className="conversation-shell">
          {messages.length === 0 ? (
            <div className="chat-main chat-main--empty">
              <section className="welcome-panel" aria-label="欢迎页">
                <p className="welcome-panel__statement">
                  一切社会现象的最终解释指向经济基础、制度结构与生产力水平，而非个人道德或文化本质。
                </p>
              </section>
            </div>
          ) : (
            <main
              className="chat-main"
              ref={chatPanelRef}
              role="log"
              aria-live="polite"
              aria-label="聊天记录"
            >
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </main>
          )}
        </div>

        <div className="composer-dock">
          {(isCurrentSessionReadOnly || isCurrentSessionLocked) && (
            <div className="chat-status-banner" role="status" aria-live="polite">
              {isCurrentSessionReadOnly
                ? '该历史记录不是当前用户创建的，只允许查看。'
                : '该历史记录已完成一轮对话，如需继续请新建对话。'}
            </div>
          )}

          <ChatInput
            onSend={handleSend}
            disabled={isInputDisabled}
            isStreaming={isStreaming}
            placeholder={inputPlaceholder}
          />
        </div>
      </section>
    </div>
  );
}

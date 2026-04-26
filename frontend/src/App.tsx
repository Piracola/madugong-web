import { useState, useRef, useEffect, useCallback } from 'react';
import MessageBubble from './components/MessageBubble';
import ChatInput from './components/ChatInput';
import Sidebar from './components/Sidebar';
import { sendChat } from './api';
import type { ChatMessage, ChatSession } from './types';

const STORAGE_KEY = 'mdg_chat_sessions';
const USER_STORAGE_KEY = 'mdg_chat_user_id';
const MAX_SESSIONS = 50;

let nextId = 0;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
  const firstUser = messages.find(m => m.role === 'user');
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
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || null;
  const messages = currentSession?.messages || [];
  const isCurrentSessionReadOnly = Boolean(currentSession && currentSession.ownerId !== currentUserId);
  const isCurrentSessionLocked = Boolean(currentSession?.isLocked);
  const isInputDisabled = isStreaming || isCurrentSessionLocked || isCurrentSessionReadOnly;
  const inputPlaceholder = isCurrentSessionReadOnly
    ? '该历史记录不是你创建的，仅支持查看'
    : isCurrentSessionLocked
      ? '该历史记录已完成一轮对话，请新建对话'
      : '输入你的消息...';

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNewSession = useCallback(() => {
    const emptySession = sessions.find(
      s => s.ownerId === currentUserId && s.messages.length === 0 && !s.isLocked,
    );
    if (emptySession) {
      setCurrentSessionId(emptySession.id);
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
  }, [currentUserId, sessions]);

  const handleSelectSession = useCallback((id: string) => {
    setCurrentSessionId(id);
  }, []);

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
        prev.map(s =>
          s.id === targetSessionId
            ? {
                ...s,
                messages: [...s.messages, userMsg, assistantMsg],
                updatedAt: Date.now(),
                title: s.title === '新对话' ? getSessionTitle([...s.messages, userMsg]) : s.title,
                isLocked: false,
              }
            : s,
        ),
      );
    }

    setIsStreaming(true);

    sendChat(
      requestMessages,
      (chunk: string) => {
        setSessions(prev =>
          prev.map(s =>
            s.id === targetSessionId
              ? {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + chunk }
                      : m,
                  ),
                  updatedAt: Date.now(),
                  isLocked: false,
                }
              : s,
          ),
        );
      },
      () => {
        setSessions(prev =>
          prev.map(s =>
            s.id === targetSessionId
              ? {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === assistantMsg.id
                      ? { ...m, isStreaming: false }
                      : m,
                  ),
                  updatedAt: Date.now(),
                  isLocked: true,
                }
              : s,
          ),
        );
        setIsStreaming(false);
      },
      (err: string) => {
        setSessions(prev =>
          prev.map(s =>
            s.id === targetSessionId
              ? {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === assistantMsg.id
                      ? { ...m, content: err, isStreaming: false, isError: true }
                      : m,
                  ),
                  updatedAt: Date.now(),
                  isLocked: true,
                }
              : s,
          ),
        );
        setIsStreaming(false);
      },
    );
  }, [currentSessionId, currentUserId, isCurrentSessionLocked, isCurrentSessionReadOnly, isStreaming]);

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        currentUserId={currentUserId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
      />
      <div className="app-main">
        <header className="app-header">
          <h1 className="app-title">马督工</h1>
          <span className="doc-label">文档-001-R · 机密</span>
        </header>

        <main
          className="chat-main"
          ref={chatPanelRef}
          role="log"
          aria-live="polite"
          aria-label="聊天记录"
        >
          {messages.length === 0 && (
            <section className="empty-state" aria-label="空状态">
              <h2>马督工</h2>
              <p>输入你的问题<br />获取风格化回答</p>
            </section>
          )}
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </main>

        {(isCurrentSessionReadOnly || isCurrentSessionLocked) && (
          <div className="chat-status-banner" role="status" aria-live="polite">
            {isCurrentSessionReadOnly
              ? '该历史记录不是当前用户创建的，只允许查看，禁止删除或继续对话。'
              : '该历史记录已完成一轮对话，当前已封锁；如需继续，请新建对话。'}
          </div>
        )}

        <ChatInput
          onSend={handleSend}
          disabled={isInputDisabled}
          isStreaming={isStreaming}
          placeholder={inputPlaceholder}
        />

        <a
          href="https://github.com/Piracola/madugong-web"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="GitHub"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
          </svg>
        </a>
      </div>
    </div>
  );
}

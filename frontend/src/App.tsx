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
  const currentSessionTitle = currentSession?.title ?? '新对话';
  const isCurrentSessionReadOnly = Boolean(currentSession && currentSession.ownerId !== currentUserId);
  const isCurrentSessionLocked = Boolean(currentSession?.isLocked);
  const isInputDisabled = isStreaming || isCurrentSessionLocked || isCurrentSessionReadOnly;
  const currentSessionStatus = isCurrentSessionReadOnly
    ? '只读'
    : isCurrentSessionLocked
      ? '已完成'
      : isStreaming
        ? '生成中'
        : '可输入';
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
    <div className="app-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />

      <aside className="corner-card corner-card--history" aria-label="历史记录面板">
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          currentUserId={currentUserId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />
      </aside>

      <section className="chat-stage">
        <div className="chat-surface">
          <header className="chat-surface__header">
            <div className="chat-surface__heading">
              <span className="panel-tag">当前会话</span>
              <h2 className="chat-surface__title">{currentSessionTitle}</h2>
            </div>
            <div className="chat-surface__meta" aria-label="会话信息">
              <span>{messages.length > 0 ? `${messages.length} 条消息` : '等待开始'}</span>
              <span>{currentSessionStatus}</span>
            </div>
          </header>

          <main
            className="chat-main"
            ref={chatPanelRef}
            role="log"
            aria-live="polite"
            aria-label="聊天记录"
          >
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </main>

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

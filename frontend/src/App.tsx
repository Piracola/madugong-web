import { useState, useRef, useEffect, useCallback } from 'react';
import MessageBubble from './components/MessageBubble';
import ChatInput from './components/ChatInput';
import Sidebar from './components/Sidebar';
import { sendChat } from './api';
import type { ChatMessage, ChatSession } from './types';

const STORAGE_KEY = 'mdg_chat_sessions';
const MAX_SESSIONS = 50;

let nextId = 0;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getSessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser) {
    return firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '...' : '');
  }
  return '新对话';
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
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
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || null;
  const messages = currentSession?.messages || [];

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNewSession = useCallback(() => {
    const emptySession = sessions.find(s => s.messages.length === 0);
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
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  }, [sessions]);

  const handleSelectSession = useCallback((id: string) => {
    setCurrentSessionId(id);
  }, []);

  const handleDeleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered;
    });
    setCurrentSessionId(prev => {
      if (prev === id) {
        const remaining = sessions.filter(s => s.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      }
      return prev;
    });
  }, [sessions]);

  const handleSend = useCallback((text: string) => {
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
    let allMessages: { role: string; content: string }[];

    if (!targetSessionId) {
      const newSession: ChatSession = {
        id: generateId(),
        title: text.slice(0, 20) + (text.length > 20 ? '...' : ''),
        messages: [userMsg, assistantMsg],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      targetSessionId = newSession.id;
      allMessages = [userMsg].map(m => ({ role: m.role, content: m.content }));
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
    } else {
      allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      setSessions(prev =>
        prev.map(s =>
          s.id === targetSessionId
            ? {
                ...s,
                messages: [...s.messages, userMsg, assistantMsg],
                updatedAt: Date.now(),
                title: s.title === '新对话' ? getSessionTitle([...s.messages, userMsg]) : s.title,
              }
            : s,
        ),
      );
    }

    setIsStreaming(true);

    sendChat(
      allMessages,
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
                }
              : s,
          ),
        );
        setIsStreaming(false);
      },
    );
  }, [currentSessionId, messages]);

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
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

        <ChatInput onSend={handleSend} disabled={isStreaming} />

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

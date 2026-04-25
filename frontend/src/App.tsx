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
      </div>
    </div>
  );
}

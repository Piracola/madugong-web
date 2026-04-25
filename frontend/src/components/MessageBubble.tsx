import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
}

function parseThinkContent(content: string): { thinkContent: string | null; mainContent: string } {
  const thinkStart = content.indexOf('<think>');
  if (thinkStart === -1) {
    return { thinkContent: null, mainContent: content };
  }

  const thinkEnd = content.indexOf('</think>', thinkStart);
  if (thinkEnd === -1) {
    const thinkContent = content.slice(thinkStart + 7);
    const mainContent = content.slice(0, thinkStart);
    return { thinkContent: thinkContent.trim() || null, mainContent };
  }

  const thinkContent = content.slice(thinkStart + 7, thinkEnd).trim();
  const mainContent = content.slice(0, thinkStart) + content.slice(thinkEnd + 8);
  return { thinkContent: thinkContent || null, mainContent };
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [isThinkExpanded, setIsThinkExpanded] = useState(false);

  const toggleThink = useCallback(() => {
    setIsThinkExpanded(prev => !prev);
  }, []);

  const { thinkContent, mainContent } = parseThinkContent(message.content);

  return (
    <article
      className={`message message--${isUser ? 'user' : 'assistant'}${message.isError ? ' message--error' : ''}`}
      aria-label={`${isUser ? '用户' : '助手'}消息`}
    >
      <span className="message-badge">{isUser ? 'TX' : 'RX'}</span>

      {message.isError ? (
        <div className="message-error">
          <span className="error-badge">SYSTEM ERROR</span>
          <p>{message.content}</p>
        </div>
      ) : message.isStreaming && message.content.length === 0 ? (
        <span className="streaming-indicator" aria-label="正在输入" />
      ) : (
        <>
          {thinkContent !== null && (
            <div className="think-block">
              <button
                className="think-toggle"
                onClick={toggleThink}
                aria-expanded={isThinkExpanded}
                aria-label={isThinkExpanded ? '收起思维链' : '展开思维链'}
              >
                <span className="think-toggle__icon">{isThinkExpanded ? '▼' : '▶'}</span>
                <span className="think-toggle__label">思维链</span>
              </button>
              {isThinkExpanded && (
                <div className="think-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinkContent}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{mainContent}</ReactMarkdown>
        </>
      )}

      {message.isStreaming && message.content.length > 0 && (
        <span className="streaming-indicator" aria-label="正在输入" />
      )}
    </article>
  );
}

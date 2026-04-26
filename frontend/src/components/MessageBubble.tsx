import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';

const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

function safeUrlTransform(url: string): string {
  try {
    const parsed = new URL(url, 'http://localhost');
    return ALLOWED_SCHEMES.includes(parsed.protocol) ? url : '';
  } catch {
    return '';
  }
}

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
  const reasoningContent = message.reasoning?.trim() || thinkContent;
  const hasReasoning = Boolean(reasoningContent);
  const isOnlyLoading = message.isStreaming && mainContent.length === 0 && !hasReasoning;

  return (
    <div className={`message-row message-row--${isUser ? 'user' : 'assistant'}`}>
      <article
        className={`message message--${isUser ? 'user' : 'assistant'}${message.isError ? ' message--error' : ''}`}
        aria-label={`${isUser ? '用户' : '助手'}消息`}
      >
        {message.isError ? (
          <div className="message-error">
            <span className="error-badge">错误</span>
            <p>{message.content}</p>
          </div>
        ) : isOnlyLoading ? (
          <div className="message-loading">
            <span className="streaming-indicator" aria-label="正在输入" />
            <span>正在思考中...</span>
          </div>
        ) : (
          <>
            {hasReasoning && (
              <div className="think-block">
                <button
                  type="button"
                  className="think-toggle"
                  onClick={toggleThink}
                  aria-expanded={isThinkExpanded}
                  aria-label={isThinkExpanded ? '收起思维链' : '展开思维链'}
                >
                  <span className="think-toggle__label">思考过程</span>
                </button>
                {isThinkExpanded && (
                  <div className="think-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrlTransform}>
                      {reasoningContent}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            {mainContent.length > 0 ? (
              <div className="message-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrlTransform}>
                  {mainContent}
                </ReactMarkdown>
              </div>
            ) : message.isStreaming ? (
              <div className="message-loading">
                <span className="streaming-indicator" aria-label="正在输入" />
                <span>正在整理最终回答...</span>
              </div>
            ) : null}
          </>
        )}
      </article>
    </div>
  );
}

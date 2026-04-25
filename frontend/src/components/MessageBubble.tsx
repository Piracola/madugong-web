import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      )}

      {message.isStreaming && message.content.length > 0 && (
        <span className="streaming-indicator" aria-label="正在输入" />
      )}
    </article>
  );
}

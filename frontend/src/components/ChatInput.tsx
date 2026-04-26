import { useRef } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  disabled,
  isStreaming = false,
  placeholder = '输入你的消息...',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const text = textareaRef.current?.value?.trim();
    if (!text || disabled) return;
    onSend(text);
    if (textareaRef.current) textareaRef.current.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <form
      className="chat-form"
      onSubmit={e => {
        e.preventDefault();
        handleSend();
      }}
      aria-label="消息输入"
    >
      <textarea
        ref={textareaRef}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
        aria-label="消息内容"
        aria-disabled={disabled}
      />
      <button
        className="send-btn"
        type="submit"
        disabled={disabled}
        aria-label={isStreaming ? '发送中，请稍候' : disabled ? '当前对话不可继续发送' : '发送消息'}
      >
        {isStreaming ? '发送中' : '发送'}
      </button>
      <a
        href="https://github.com/Piracola/madugong-web"
        target="_blank"
        rel="noopener noreferrer"
        className="github-inline-link"
        aria-label="打开项目 GitHub 仓库"
        title="GitHub"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
        </svg>
      </a>
    </form>
  );
}

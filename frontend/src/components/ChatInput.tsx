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
        {isStreaming ? '发送中...' : '发送'}
      </button>
    </form>
  );
}

import { useRef } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
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
        placeholder="输入你的消息..."
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
        aria-label={disabled ? '发送中，请稍候' : '发送消息'}
      >
        {disabled ? '发送中...' : '发送'}
      </button>
    </form>
  );
}

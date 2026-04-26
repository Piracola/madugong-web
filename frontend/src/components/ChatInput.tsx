import { useEffect, useRef, useState } from 'react';

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
  const [value, setValue] = useState('');

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [value]);

  const handleSend = () => {
    const text = value.trim();
    if (!text || disabled) {
      return;
    }

    onSend(text);
    setValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-form-shell">
      <form
        className="chat-form"
        onSubmit={event => {
          event.preventDefault();
          handleSend();
        }}
        aria-label="消息输入"
      >
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onChange={event => setValue(event.target.value)}
          value={value}
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
          {isStreaming ? '生成中' : '发送'}
        </button>
      </form>
    </div>
  );
}

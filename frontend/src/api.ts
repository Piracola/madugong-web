interface SSEEvent {
  type: 'chunk' | 'done' | 'error' | 'status';
  content?: string;
  message?: string;
}

export async function sendChat(
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        onError('请求过于频繁，请稍后再试');
      } else {
        onError(`HTTP ${response.status}`);
      }
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedDone = false;
    let hasError = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6);
        try {
          const event: SSEEvent = JSON.parse(json);
          if (event.type === 'chunk' && event.content) {
            onChunk(event.content);
          } else if (event.type === 'done') {
            receivedDone = true;
            onDone();
          } else if (event.type === 'error') {
            hasError = true;
            onError(event.message || '后端处理出错');
            return;
          }
        } catch {
          // ignore malformed JSON
        }
      }
    }

    // 流结束时 buffer 中可能还有未处理的最后一行
    if (buffer.trim()) {
      try {
        const event: SSEEvent = JSON.parse(buffer.replace(/^data: /, ''));
        if (event.type === 'chunk' && event.content) {
          onChunk(event.content);
        } else if (event.type === 'done') {
          receivedDone = true;
        } else if (event.type === 'error') {
          hasError = true;
          onError(event.message || '后端处理出错');
          return;
        }
      } catch {
        // ignore
      }
    }

    if (!receivedDone && !hasError) {
      onError('连接异常中断，未收到完整响应');
      return;
    }

    if (!hasError) {
      onDone();
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Network error');
  }
}

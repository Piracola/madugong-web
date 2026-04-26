interface SSEEvent {
  type: 'chunk' | 'done' | 'error' | 'status';
  content?: string;
  message?: string;
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string' && data.detail.trim()) {
      return data.detail;
    }
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      const firstDetail = data.detail[0];
      if (typeof firstDetail?.msg === 'string' && firstDetail.msg.trim()) {
        return firstDetail.msg;
      }
    }
  } catch {
    // ignore malformed error bodies
  }

  return `HTTP ${response.status}`;
}

export async function sendChat(
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        onError('请求过于频繁，请稍后再试');
      } else {
        onError(await getErrorMessage(response));
      }
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedDone = false;
    let hasError = false;
    let doneNotified = false;

    const notifyDone = () => {
      if (doneNotified) return;
      doneNotified = true;
      onDone();
    };

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
            notifyDone();
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
      notifyDone();
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Network error');
  }
}

export async function getConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateConfig(data: Record<string, unknown>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

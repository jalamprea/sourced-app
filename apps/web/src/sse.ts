import type { ChatEvent } from '@coach/shared';

/**
 * SSE reader built on fetch.
 *
 * `EventSource` cannot be used here: it is GET-only and the chat endpoint needs a POST
 * body. So we parse the wire format ourselves — frames separated by a blank line, with
 * `event:` and `data:` fields, plus `:` comment lines used as heartbeats.
 *
 * A network chunk can split a frame anywhere, so everything goes through a buffer and
 * only complete frames are emitted.
 */
export async function* readSSE(response: Response): AsyncGenerator<ChatEvent> {
  if (!response.body) throw new Error('respuesta sin cuerpo');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf('\n\n');
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        let name = 'message';
        const data: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith(':')) continue; // heartbeat
          if (line.startsWith('event:')) name = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }

        if (data.length > 0) {
          const payload = JSON.parse(data.join('\n')) as Record<string, unknown>;
          yield { type: name, ...payload } as ChatEvent;
        }

        split = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function openChatStream(
  coachId: string,
  content: string,
  mode: 'coach' | 'generic',
  signal: AbortSignal,
): Promise<Response> {
  const response = await fetch(`/api/coaches/${coachId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, mode }),
    signal,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
}

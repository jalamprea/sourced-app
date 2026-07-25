import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.ts';

export const CHAT_MODEL = 'claude-opus-5';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Streams assistant text deltas.
 *
 * Thinking is disabled deliberately. On Claude Opus 5 thinking is ON by default, which
 * delays the first token — and in a live demo, time-to-first-token *is* the product.
 * Disabling it is only valid at effort `high` or below, hence `low`. The two known
 * thinking-disabled failure modes are handled: tool calls leaking into text does not
 * apply (this path declares no tools), and stray `<thinking>` tags are covered by the
 * last line of the prompt rules.
 */
export async function* streamAnswer(
  system: string,
  history: ChatTurn[],
  signal: AbortSignal,
): AsyncGenerator<string> {
  const stream = getClient().messages.stream(
    {
      model: CHAT_MODEL,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system,
      messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

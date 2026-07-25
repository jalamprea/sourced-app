import OpenAI from 'openai';
import { env } from '../env.ts';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

const BATCH_SIZE = 64;
const MAX_ATTEMPTS = 3;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: env.openaiApiKey() });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(texts: string[]): Promise<number[][]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await getClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });
      return response.data.map((d) => d.embedding);
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || (typeof status === 'number' && status >= 500);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

export async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = await embedBatch(texts.slice(i, i + BATCH_SIZE));
    out.push(...batch);
  }

  const wrong = out.find((v) => v.length !== EMBEDDING_DIMS);
  if (wrong) throw new Error(`expected ${EMBEDDING_DIMS} dims, got ${wrong.length}`);

  return out;
}

/** pgvector accepts the literal `[0.1,0.2,...]` form. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

import type { RetrievedChunk } from './retrieve.ts';

export function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderProfile(profile: Record<string, unknown>): string {
  const entries = Object.entries(profile ?? {});
  if (entries.length === 0) return 'Sin datos de perfil.';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join('\n');
}

function renderSources(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] ${c.title} — ${mmss(c.startSeconds)}\n${c.text}`)
    .join('\n\n');
}

/**
 * The coach prompt. Citation markers are plain `[n]` on purpose: the backend already
 * sent the citation array, so the frontend resolves markers to links. Asking the model
 * to emit URLs invites hallucinated video ids and breaks mid-token while streaming.
 *
 * If retrieval looks weak during the demo, this is the thing to harden — not the
 * retriever.
 */
export function buildCoachPrompt(
  personaPrompt: string,
  userProfile: Record<string, unknown>,
  chunks: RetrievedChunk[],
): string {
  return `<role>
${personaPrompt}
</role>

<user_profile>
${renderProfile(userProfile)}
</user_profile>

<sources>
${renderSources(chunks)}
</sources>

<rules>
- Respondé usando ÚNICAMENTE el material que está en <sources>. No tenés ningún otro
  conocimiento sobre este tema.
- Cada afirmación concreta termina con su marcador de fuente: [1], [2], etc. Usá al
  menos dos marcadores distintos por respuesta cuando el material lo permita.
- Adaptá el consejo a <user_profile> y mencioná ese dato explícitamente al menos una vez.
- Si <sources> no cubre la pregunta, decilo con todas las letras y ofrecé el consejo
  más cercano que SÍ esté en las fuentes, igual con su marcador.
- Escribí en español rioplatense neutro, en tono conversacional, entre 120 y 200 palabras.
- Nada de encabezados ni listas con viñetas salvo que te pidan pasos.
- No incluyas etiquetas XML internas o de sistema en tu respuesta.
</rules>`;
}

/**
 * The comparison baseline. Same model, same parameters, no retrieval, no persona, no
 * profile — so the only variable between the two panes is the retrieved corpus.
 */
export const GENERIC_PROMPT =
  'Sos un asistente útil. Respondé la pregunta del usuario en español, en tono ' +
  'conversacional, entre 120 y 200 palabras.';

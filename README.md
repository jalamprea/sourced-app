<img src="./project-logo.png" alt="Sourced" width="120" />

# Sourced

**Tu coach personal, entrenado con expertos reales.**

Las IAs dan consejos genéricos. El consejo bueno está en cientos de horas de video de
expertos reales que nadie va a ver. Sourced convierte esos videos en un coach personal
con el que chateás, y **cada respuesta cita la fuente y el minuto exacto**.

Elegís un dominio, respondés tres preguntas de perfil, y en unos segundos tenés un coach
entrenado con transcripciones de especialistas de YouTube. Cuando te responde, cada
afirmación lleva un número clicable que te lleva al segundo exacto del video del que
salió.

Hacker: Julian Lamprea ([@jalamprea](https://github.com/jalamprea)) — Platanus Build
Night, Bogotá @ Buk. Construido en 9 horas.

---

## El momento que importa

`Comparar` pone la misma pregunta contra un LLM genérico y contra el coach entrenado,
lado a lado. **Mismo modelo, mismos parámetros, sin retrieval de un lado.** Lo único que
cambia es el material — así la diferencia en pantalla es atribuible al producto y no a
haber elegido un modelo más chico de un lado.

| | Fuentes | Perfil del usuario | Citas |
| --- | --- | --- | --- |
| LLM genérico | ninguna | no | no |
| Tu coach | 8 chunks recuperados | sí | al minuto exacto |

---

## Cómo funciona

```
yt-dlp → parser VTT → chunks de ~500 tokens → embeddings → pgvector
                                                              │
pregunta → embedding → top-8 por coseno ──────────────────────┘
                              │
                              ├─ persona del dominio
                              ├─ perfil del usuario     ──→  Anthropic  ──→ SSE ──→ UI
                              └─ fuentes con timestamp
```

Tres dominios pre-curados: **imagen y estilo**, **entrenamiento**, **cuidado del
cabello**. 33 videos en español, subtítulos verificados antes de ingestar, 296 chunks.

La ingesta corre **offline como CLI**, nunca desde un endpoint, y cachea todo en disco:
la demo jamás toca YouTube en vivo.

---

## Correrlo

Necesitás Docker, `yt-dlp` (`brew install yt-dlp`) y Node 22.20 (está en `.nvmrc`).

```bash
nvm use                       # el pnpm instalado exige Node >= 22.13
pnpm install
cp .env.example .env          # cargá OPENAI_API_KEY y ANTHROPIC_API_KEY

pnpm db:up                    # Postgres 16 + pgvector
pnpm db:migrate
pnpm ingest -- --domain all   # ~2 min, 296 embeddings (menos de un centavo)

pnpm dev                      # api :3000 + web :5173
```

Para probar el pipeline sin gastar embeddings: `pnpm ingest -- --domain all --dry-run`.

### Otros comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm demo:reset` | Borra coaches de prueba, recrea uno "golden" por dominio e imprime links directos |
| `pnpm --filter api test` | Smoke test del parser de subtítulos |
| `pnpm db:psql` | Shell de psql en el contenedor |
| `pnpm db:reset` | Tira el volumen y arranca limpio |

---

## Decisiones que vale la pena conocer

**El corpus se clona, no se filtra.** La ingesta escribe en un coach *template* por
dominio; al crear un coach de usuario se copian sus filas de video y chunks. Mantiene
`where coach_id = $1` en el retrieval y hace que la pantalla de entrenamiento muestre
progreso real en vez de un spinner.

**El perfil condiciona el prompt, no el retrieval.** Con 75-111 chunks por coach,
cualquier filtro por metadata destruiría el recall. Además así la personalización se
**lee** en la respuesta ("en tu caso, con pelo rizado y dos lavados por semana").

**El modelo emite `[n]`, nunca URLs.** El backend manda las citas antes del primer token
y el frontend resuelve los marcadores a links. Pedirle URLs al modelo invita a IDs de
video alucinados y se rompe a mitad del streaming.

**Un solo parser para dos formatos de subtítulos.** Los manuales traen todo el contenido
nuevo en 1-2 líneas por cue; los automáticos usan una ventana deslizante que repite la
línea anterior. Concatenar el texto crudo de los automáticos da el transcript duplicado
2-3 veces. El test compara la pista manual y la automática *del mismo video* y verifica
que converjan.

`docs/spec.md` tiene la spec completa con las tres decisiones de ambigüedad y sus
alternativas; `docs/tasks.md` tiene el desglose por fase con los números medidos y los
problemas que aparecieron en cada una.

---

## Stack

TypeScript · Fastify + TypeBox · React + Vite + Tailwind (PWA) · Postgres 16 + pgvector ·
OpenAI `text-embedding-3-small` · Anthropic `claude-opus-5` por SSE · `yt-dlp`

---

## Deploy

Este repo se espeja a un repo personal, porque las plataformas de deploy solo pueden
conectarse a repos propios:

```bash
git remote set-url --add --push origin git@github.com:platanus-build-night/platanus-build-night-26-co-jalamprea.git
git remote set-url --add --push origin git@github.com:jalamprea/sourced-app.git
```

Con las dos URLs cargadas, un solo `git push` actualiza ambos repos. Los commits quedan
espejados acá para el jurado, y el deploy corre desde el repo personal.

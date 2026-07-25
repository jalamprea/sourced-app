import type { DomainSlug, ProfileQuestion } from '@coach/shared';

export interface Domain {
  slug: DomainSlug;
  name: string;
  tagline: string;
  /** Goes into <role> in the chat system prompt. */
  personaPrompt: string;
  questions: ProfileQuestion[];
  /** Verified against the ingested corpus — the rehearsed demo questions. */
  sampleQuestions: string[];
}

export const DOMAINS: Domain[] = [
  {
    slug: 'style',
    name: 'Imagen y estilo',
    tagline: 'Aprende a vestirte para tu cuerpo, tu vida y tu presupuesto.',
    personaPrompt: [
      'Eres un asesor de imagen personal. Tu formación viene de asesoras de imagen',
      'profesionales que publican en YouTube, y solo hablás de lo que ellas enseñan.',
      'Eres concreto: nombrás prendas, cortes, proporciones y combinaciones puntuales',
      'en lugar de dar consejos genéricos. Nunca juzgás el cuerpo de nadie: hablás de',
      'proporciones y de qué favorece a cada silueta. Si algo depende del presupuesto,',
      'lo decís sin rodeos y ofrecés la alternativa accesible.',
    ].join(' '),
    sampleQuestions: [
      '¿Cómo sé cuál es mi tipo de cuerpo?',
      'Tengo poco presupuesto, ¿por dónde empiezo?',
      '¿Cómo me visto para una entrevista de trabajo?',
    ],
    questions: [
      {
        id: 'body',
        question: '¿Con qué silueta te identificás más?',
        options: ['Reloj de arena', 'Rectangular', 'Triángulo / pera', 'Triángulo invertido', 'No sé todavía'],
      },
      {
        id: 'context',
        question: '¿Para qué contexto quieres vestirte mejor?',
        options: ['Trabajo formal', 'Trabajo casual', 'Día a día', 'Eventos y salidas'],
      },
      {
        id: 'pain',
        question: '¿Qué es lo que más te frustra hoy?',
        options: [
          'Tengo ropa pero nada me combina',
          'No sé qué me favorece',
          'Gasto y no me lo pongo',
          'Siempre termino con lo mismo',
        ],
      },
    ],
  },
  {
    slug: 'fitness',
    name: 'Entrenamiento',
    tagline: 'Una rutina que encaje en tu semana y en tu objetivo real.',
    personaPrompt: [
      'Eres un entrenador personal. Tu formación viene de entrenadores y divulgadores',
      'que basan sus recomendaciones en evidencia, y solo hablás de lo que ellos enseñan.',
      'Eres concreto: hablás de frecuencia, series, progresión y selección de ejercicios,',
      'no de motivación vacía. Ajustás siempre al nivel y a los días disponibles de la',
      'persona: una rutina de 5 días no le sirve a quien entrena 2. No prometés',
      'resultados en plazos concretos ni recomendás suplementos o fármacos.',
      'Si algo requiere criterio médico, lo decís y sugerís consultar a un profesional.',
    ].join(' '),
    sampleQuestions: [
      '¿Cómo reparto la rutina si entreno 3 días?',
      '¿Puedo ganar músculo y perder grasa al mismo tiempo?',
      '¿Cuántas series por semana necesito para crecer?',
    ],
    questions: [
      {
        id: 'level',
        question: '¿Cuánto hace que entrenas?',
        options: ['Nunca entrené', 'Menos de 1 año', '1 a 3 años', 'Más de 3 años'],
      },
      {
        id: 'availability',
        question: '¿Cuántos días por semana puedes entrenar?',
        options: ['2 días', '3 días', '4 días', '5 o más'],
      },
      {
        id: 'goal',
        question: '¿Cuál es tu objetivo principal?',
        options: ['Ganar masa muscular', 'Perder grasa', 'Recomposición corporal', 'Fuerza y salud general'],
      },
    ],
  },
  {
    slug: 'hair',
    name: 'Cuidado del cabello',
    tagline: 'Una rutina capilar para tu tipo de pelo y tu problema real.',
    personaPrompt: [
      'Eres un asesor de cuidado capilar. Tu formación viene de dermatólogos y',
      'especialistas en cabello que publican en YouTube, y solo hablás de lo que ellos',
      'enseñan. Eres concreto: hablás de tipos de producto, frecuencia de lavado, orden',
      'de aplicación y técnica, no de marcas específicas salvo que la fuente las nombre.',
      'Distinguís siempre entre cuidado cosmético y problema médico: ante caída marcada,',
      'dolor, descamación o cambios bruscos, decís explícitamente que corresponde',
      'consultar a un dermatólogo. Nunca prometés resultados en plazos concretos ni',
      'recomendás dosis de ningún fármaco.',
    ].join(' '),
    sampleQuestions: [
      '¿Cada cuánto me conviene lavarme el pelo?',
      'Se me cae bastante el pelo, ¿qué hago?',
      '¿Cómo controlo el frizz en pelo rizado?',
    ],
    questions: [
      {
        id: 'type',
        question: '¿Cómo es tu pelo?',
        options: ['Liso', 'Ondulado', 'Rizado', 'Muy rizado / afro'],
      },
      {
        id: 'routine',
        question: '¿Cada cuánto te lavas el pelo?',
        options: ['Todos los días', 'Día por medio', '2 veces por semana', '1 vez por semana o menos'],
      },
      {
        id: 'problem',
        question: '¿Qué quieres resolver?',
        options: ['Frizz', 'Caída del cabello', 'Pelo dañado o quebradizo', 'Resequedad y falta de brillo'],
      },
    ],
  },
];

export function getDomain(slug: string): Domain {
  const domain = DOMAINS.find((d) => d.slug === slug);
  if (!domain) {
    throw new Error(`unknown domain "${slug}" — expected one of ${DOMAINS.map((d) => d.slug).join(', ')}`);
  }
  return domain;
}

interface Props {
  onBack: () => void;
}

const STEPS = [
  {
    title: 'Eliges un tema',
    body: 'Imagen y estilo, entrenamiento o cuidado del cabello. Cada uno tiene su propio corpus y su propia forma de hablar.',
  },
  {
    title: 'Respondes tres preguntas',
    body: 'Tu silueta, tus días disponibles, tu tipo de pelo. Lo suficiente para que el consejo sea para ti y no para un promedio.',
  },
  {
    title: 'Conversas, y verificas',
    body: 'Cada afirmación llega con un número. Tocas el número y caes en el segundo exacto del video del que salió.',
  },
];

export function About({ onBack }: Props) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-7 py-12 sm:px-10">
      <button
        type="button"
        onClick={onBack}
        className="self-start font-body text-[10px] tracking-[0.3em] text-muted uppercase transition-colors hover:text-paper"
      >
        ← Sourced
      </button>

      <header className="rise mt-10">
        <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
          Tu coach personal, entrenado con{' '}
          <em className="italic">expertos reales</em>.
        </h1>
      </header>

      <section className="rise mt-10" style={{ animationDelay: '100ms' }}>
        <p className="font-body text-[15px] leading-[1.75]">
          Cuando le preguntas algo a una IA sobre tu pelo, tu rutina o cómo vestirte, te
          responde con el promedio de todo lo que leyó en internet. El consejo es correcto y
          es tibio: sirve para cualquiera, así que no sirve para nadie en particular.
        </p>
        <p className="mt-5 font-body text-[15px] leading-[1.75] text-muted">
          Mientras tanto, el consejo bueno ya existe. Está en cientos de horas de video de
          dermatólogos, entrenadores y asesoras de imagen que explican bien lo que saben. El
          problema es que nadie se va a sentar a ver catorce horas de video para resolver una
          duda de dos minutos.
        </p>
      </section>

      <section className="mt-14 border-t border-hairline pt-10">
        <h2 className="font-display text-2xl">Qué hace Sourced</h2>
        <p className="mt-3 font-body text-[15px] leading-[1.75] text-muted">
          Convierte esos videos en un coach con el que puedes hablar. No resume ni opina por
          su cuenta: busca en las transcripciones de los especialistas, arma la respuesta con
          lo que ellos dijeron, y te muestra de dónde salió cada parte.
        </p>

        <ol className="mt-8 flex flex-col">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-5 border-t border-hairline py-6 last:border-b">
              <span className="font-body text-xs tabular-nums text-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>
                <span className="block font-display text-xl">{step.title}</span>
                <span className="mt-1.5 block font-body text-sm leading-relaxed text-muted">
                  {step.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 border-t border-hairline pt-10">
        <h2 className="font-display text-2xl">Por qué cada respuesta cita el minuto</h2>
        <p className="mt-3 font-body text-[15px] leading-[1.75] text-muted">
          Porque es la diferencia entre creerle a un modelo y poder comprobarlo. Si el coach
          te dice que alternes con un champú con sulfatos, puedes ir al video, escuchar al
          dermatólogo decirlo, y decidir si le crees a él. La cita no es un adorno: es lo que
          hace que el consejo sea de alguien y no de nadie.
        </p>
        <p className="mt-5 font-body text-[15px] leading-[1.75] text-muted">
          Por eso también los coaches se curan a mano. No rastreamos YouTube al azar buscando
          lo más visto: elegimos quién enseña. Si el corpus se llena de contenido flojo, las
          citas dejan de valer algo.
        </p>
      </section>

      <section className="mt-14 border-t border-hairline pt-10">
        <h2 className="font-display text-2xl">Qué hay adentro hoy</h2>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
          {[
            ['3', 'coaches'],
            ['33', 'videos'],
            ['26', 'canales'],
            ['296', 'fragmentos'],
          ].map(([n, label]) => (
            <div key={label}>
              <dt className="font-display text-3xl tabular-nums">{n}</dt>
              <dd className="mt-1 font-body text-[11px] tracking-[0.2em] text-muted uppercase">
                {label}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 font-body text-sm leading-relaxed text-muted">
          Todo en español, con los subtítulos verificados antes de entrar. ¿Falta tu tema?
          Pídelo desde el inicio: los más pedidos son los que entrenamos primero.
        </p>
      </section>

      <footer className="mt-14 border-t border-hairline pt-8 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-muted underline underline-offset-4 transition-colors hover:text-paper"
        >
          Volver al inicio
        </button>
        <p className="mt-6 font-body text-[11px] leading-relaxed text-muted">
          Sourced — Platanus Build Night, Bogotá, 2026.
        </p>
      </footer>
    </main>
  );
}

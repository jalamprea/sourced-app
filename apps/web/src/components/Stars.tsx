import { useId } from 'react';

interface Props {
  /** 0-5; fractional values render a partially filled star. */
  value: number;
  size?: number;
  /** When set the stars become a 1-5 picker. */
  onPick?: (stars: number) => void;
}

const STAR = 'M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.7 6.1 20.8l1.2-6.6L2.5 9.5l6.6-.9z';

export function Stars({ value, size = 15, onPick }: Props) {
  // SVG gradient ids share one document-wide namespace. Deriving them from the value
  // made two domains with the same average collide, and the second set of stars painted
  // itself with the first one's accent colour. useId is unique per component instance.
  const uid = useId().replace(/:/g, '');
  const box = onPick ? size * 2 : size;

  return (
    <span className={`inline-flex items-center ${onPick ? 'gap-2' : 'gap-1'}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        const gradient = `${uid}-${n}`;

        const star = (
          <svg viewBox="0 0 24 24" width={box} height={box} aria-hidden className="block">
            {fill > 0 && fill < 1 && (
              <defs>
                <linearGradient id={gradient}>
                  <stop offset={`${fill * 100}%`} stopColor="var(--accent)" />
                  <stop offset={`${fill * 100}%`} stopColor="var(--accent)" stopOpacity="0.18" />
                </linearGradient>
              </defs>
            )}
            <path
              d={STAR}
              fill={
                fill >= 1
                  ? 'var(--accent)'
                  : fill <= 0
                    ? 'color-mix(in oklab, var(--accent) 18%, transparent)'
                    : `url(#${gradient})`
              }
              stroke="var(--accent)"
              strokeWidth="1.4"
              strokeLinejoin="round"
              strokeOpacity={fill > 0 ? 0.9 : 0.4}
            />
          </svg>
        );

        return onPick ? (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
            className="transition-transform hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n} className="block">
            {star}
          </span>
        );
      })}
    </span>
  );
}

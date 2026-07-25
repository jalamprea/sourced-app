interface Props {
  /** 0-5, fractional values render a partially filled star. */
  value: number;
  size?: number;
  /** When set the stars become a 1-5 picker. */
  onPick?: (stars: number) => void;
}

const STAR = 'M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.7 6.1 20.8l1.2-6.6L2.5 9.5l6.6-.9z';

export function Stars({ value, size = 14, onPick }: Props) {
  return (
    <span className={`inline-flex items-center ${onPick ? 'gap-2' : 'gap-0.5'}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        // Fraction of this star that should be filled, so 4.3 does not read as 4.
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        const star = (
          <svg
            viewBox="0 0 24 24"
            width={onPick ? size * 2 : size}
            height={onPick ? size * 2 : size}
            aria-hidden
          >
            <defs>
              <linearGradient id={`s${n}-${Math.round(value * 10)}`}>
                <stop offset={`${fill * 100}%`} stopColor="var(--accent)" />
                <stop offset={`${fill * 100}%`} stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              d={STAR}
              fill={`url(#s${n}-${Math.round(value * 10)})`}
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              opacity={fill > 0 ? 1 : 0.35}
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
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

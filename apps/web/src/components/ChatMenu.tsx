import { useEffect, useRef, useState } from 'react';

interface Props {
  onRate: () => void;
  onReset: () => void;
}

/**
 * The "⋯" beside the send button. It opens upward because it lives on the bottom edge,
 * and it is where destructive or occasional actions go — keeping them out of the header,
 * which belongs to the two things used constantly: going home and comparing.
 */
export function ChatMenu({ onRate, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item =
    'block w-full px-4 py-3 text-left font-body text-sm transition-colors hover:bg-hairline';

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más opciones"
        className="rounded-sm border border-hairline px-3 py-3 font-body text-lg leading-none text-muted transition-colors hover:border-[var(--accent)] hover:text-paper"
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full z-30 mb-2 w-56 overflow-hidden rounded-md border border-hairline bg-surface shadow-2xl shadow-black/50"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onRate();
            }}
          >
            Calificar este coach
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} border-t border-hairline text-style`}
            onClick={() => {
              setOpen(false);
              onReset();
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

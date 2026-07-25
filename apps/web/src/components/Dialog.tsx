import { useEffect } from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

/** Centred sheet with a scrim. Escape and a scrim click both dismiss. */
export function Dialog({ title, children, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="rise w-full max-w-sm rounded-md border border-hairline bg-surface p-6"
      >
        <h2 className="font-display text-2xl leading-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}

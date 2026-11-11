'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export default function SeatingDialog({ children, labelledBy, close }: { children: ReactNode; labelledBy: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="seating-modal" aria-labelledby={labelledBy} onCancel={close}>{children}</dialog>;
}

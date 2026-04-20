import { I } from '@/icons';
// Toast host — context provider + bottom-centre stack renderer.
// Ports prototype primitives.jsx `ToastHost` / `useToast`.
import { type ReactNode, createContext, useCallback, useContext, useState } from 'react';

type ToastKind = 'default' | 'success' | 'error';
interface Toast {
  id: string;
  msg: ReactNode;
  kind: ToastKind;
}
type Push = (msg: ReactNode, kind?: ToastKind) => void;

const ToastCtx = createContext<Push | null>(null);

export function useToast(): Push {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastHost>');
  return ctx;
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((msg, kind = 'default') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'success' && <I.Check size={14} />}
            {t.kind === 'error' && <I.AlertTri size={14} />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

// Small, non-blocking notifications at the top of the screen (clear of the bottom bars).
// They never push the page content around and disappear on their own.

type ToastType = 'success' | 'error' | 'info';
interface ToastAction { label: string; onClick: () => void; }
interface ToastItem { id: number; message: string; type: ToastType; action?: ToastAction; }

type ToastFn = (message: string, opts?: { type?: ToastType; action?: ToastAction; ms?: number }) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = (id: number) => setItems(list => list.filter(t => t.id !== id));

  const toast = useCallback<ToastFn>((message, opts = {}) => {
    const id = nextId.current++;
    const type = opts.type || (message.startsWith('❌') ? 'error' : 'success');
    const ms = opts.ms ?? (opts.action ? 6000 : type === 'error' ? 4000 : 1800);
    setItems(list => [...list.slice(-2), { id, message, type, action: opts.action }]);
    window.setTimeout(() => dismiss(id), ms);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none print:hidden pt-[env(safe-area-inset-top)]">
        {items.map(t => (
          <div key={t.id}
            className={`pointer-events-auto max-w-md w-full sm:w-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-[toastIn_.15s_ease-out]
              ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'info' ? 'bg-white text-blue-900' : 'bg-emerald-600 text-white'}`}
            onClick={() => dismiss(t.id)}>
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={e => { e.stopPropagation(); dismiss(t.id); t.action!.onClick(); }}
                className="shrink-0 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold">
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

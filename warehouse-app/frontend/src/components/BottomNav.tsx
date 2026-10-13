import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { deptInfo, getRememberedDept, isDept, otherDept, rememberDept } from '../lib/dept';

// Always-visible bar at the bottom of the screen: one tap to jump between
// Orders, Sign-off, Pickers and Checkers, and to flip department —
// no more going back to the home screen.

export function useCurrentDept(): string {
  const { pathname, search } = useLocation();
  const fromPath = pathname.match(/^\/admin\/([^/]+)/)?.[1];
  const fromQuery = new URLSearchParams(search).get('dept');
  const d = [fromPath, fromQuery, getRememberedDept()].find(isDept);
  return d || 'machinery';
}

export default function BottomNav() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const dept = useCurrentDept();

  useEffect(() => { rememberDept(dept); }, [dept]);

  if (pathname === '/login') return null;

  const switchDept = () => {
    const d = otherDept(dept);
    rememberDept(d);
    if (pathname.startsWith('/admin/')) navigate(pathname.replace(/^\/admin\/[^/]+/, `/admin/${d}`) + search);
    else if (pathname.startsWith('/picker')) navigate(`/pickers?dept=${d}`);
    else if (pathname.startsWith('/checker')) navigate(`/checkers?dept=${d}`);
    else navigate(`${pathname}?dept=${d}`);
  };

  const items = [
    ...(isAdmin ? [
      { icon: '📋', label: 'Orders',   to: `/admin/${dept}/orders`,  active: pathname.endsWith('/orders') || pathname.endsWith('/approved') },
      { icon: '✍️', label: 'Sign-off', to: `/admin/${dept}/signoff`, active: pathname.endsWith('/signoff') },
    ] : []),
    { icon: '🧳', label: 'Pickers',  to: `/pickers?dept=${dept}`,  active: pathname.startsWith('/picker') },
    { icon: '✅', label: 'Checkers', to: `/checkers?dept=${dept}`, active: pathname.startsWith('/checker') },
    isAdmin
      ? { icon: '⚙️', label: 'Team',  to: `/admin/${dept}`, active: /^\/admin\/[^/]+$/.test(pathname) }
      : { icon: '🔐', label: 'Admin', to: '/login',          active: false },
  ];

  const d = deptInfo(dept);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 print:hidden bg-blue-950/95 backdrop-blur border-t border-blue-800 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-2xl mx-auto flex items-stretch h-16">
        <button onClick={switchDept} title="Switch department"
          className="w-16 shrink-0 flex flex-col items-center justify-center gap-0.5 text-blue-200 active:scale-95 transition-transform">
          <span className="text-lg leading-none">{d.icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide">{d.short}</span>
          <span className="text-[9px] text-blue-400">⇄ switch</span>
        </button>
        <div className="w-px bg-blue-800 my-3" />
        {items.map(it => (
          <button key={it.label} onClick={() => navigate(it.to)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all
              ${it.active ? 'text-white' : 'text-blue-400'}`}>
            <span className={`text-xl leading-none ${it.active ? '' : 'grayscale opacity-70'}`}>{it.icon}</span>
            <span className={`text-[11px] font-semibold ${it.active ? 'text-white' : ''}`}>{it.label}</span>
            {it.active && <span className="w-6 h-0.5 rounded-full bg-blue-400 mt-0.5" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLive, prefetch } from '../lib/useLive';

// Horizontal strip of names at the top of a picker/checker dashboard.
// One tap jumps straight to another person — no going back through menus.

interface Person { id: string; name: string; assigned_count?: number; picking_count?: number; }

export default function PersonSwitcher({ role, dept, currentId }: {
  role: 'picker' | 'checker'; dept: string; currentId?: string;
}) {
  const navigate = useNavigate();
  const listUrl = role === 'picker' ? `/pickers?department=${dept}&counts=1` : `/checkers?department=${dept}`;
  const { data } = useLive<Person[]>(listUrl, role === 'picker' ? 30000 : 0);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [currentId, data]);

  if (!data?.length) return null;

  return (
    <div className="-mx-4 md:mx-0 mb-4 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 px-4 md:px-0 w-max">
        {data.map(p => {
          const active = p.id === currentId;
          const todo = (p.assigned_count || 0) + (p.picking_count || 0);
          return (
            <button key={p.id} ref={active ? activeRef : undefined}
              onPointerDown={() => prefetch(`/${role}s/${p.id}/orders`)}
              onClick={() => !active && navigate(`/${role}/${p.id}?dept=${dept}`, { replace: true })}
              className={`relative shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95
                ${active ? 'bg-white text-blue-900 shadow-lg' : 'bg-blue-900 text-blue-200 hover:bg-blue-800'}`}>
              {p.name}
              {todo > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[11px]
                  ${active ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}>{todo}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLive, prefetch } from '../lib/useLive';
import { DEPARTMENTS, getRememberedDept, isDept, rememberDept } from '../lib/dept';

// Shared "tap your name" screen for pickers and checkers.
// Opens straight on the last-used department (switch with one tap at the top).

interface Person { id: string; name: string; assigned_count?: number; picking_count?: number; }

export default function PeopleSelect({ role }: { role: 'picker' | 'checker' }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('dept');
  const dept = isDept(fromUrl) ? fromUrl : (isDept(getRememberedDept()) ? getRememberedDept()! : null);

  // Put the department in the URL so Back / refresh keep it
  useEffect(() => {
    if (dept && fromUrl !== dept) setParams({ dept }, { replace: true });
    if (dept) rememberDept(dept);
  }, [dept, fromUrl, setParams]);

  const listUrl = dept ? (role === 'picker' ? `/pickers?department=${dept}&counts=1` : `/checkers?department=${dept}`) : null;
  const { data, loading, error } = useLive<Person[]>(listUrl, role === 'picker' ? 30000 : 0);

  const icon  = role === 'picker' ? '🧳' : '✅';
  const title = role === 'picker' ? 'Pickers' : 'Checkers';

  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-5 mt-2">
          <div className="text-4xl mb-1">{icon}</div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>
          <p className="text-blue-300 mt-1 text-sm">{dept ? 'Tap your name' : 'Select your department'}</p>
        </div>

        {/* Department switch */}
        <div className="flex bg-blue-900 rounded-2xl p-1 mb-5 max-w-sm mx-auto">
          {DEPARTMENTS.map(d => (
            <button key={d.value} onClick={() => { rememberDept(d.value); setParams({ dept: d.value }, { replace: true }); }}
              className={`flex-1 py-3 rounded-xl font-bold text-sm md:text-base transition-all
                ${dept === d.value ? 'bg-white text-blue-900 shadow' : 'text-blue-300 hover:text-white'}`}>
              {d.icon} {d.label}
            </button>
          ))}
        </div>

        {dept && loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-28 rounded-2xl bg-blue-900/60 animate-pulse" />)}
          </div>
        )}
        {error && <div className="text-center text-red-300 py-6">⚠ {error}</div>}
        {dept && !loading && !error && data?.length === 0 && (
          <div className="text-center text-blue-300 py-12 text-lg">No {title.toLowerCase()} in this department</div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {(data || []).map(p => {
            const todo = p.assigned_count || 0;
            const busy = p.picking_count || 0;
            return (
              <button key={p.id}
                onPointerDown={() => prefetch(`/${role}s/${p.id}/orders`)}
                onClick={() => navigate(`/${role}/${p.id}?dept=${dept}`)}
                className="bg-white hover:bg-blue-50 active:scale-95 text-blue-900 font-bold rounded-2xl shadow-lg transition-all h-28 flex flex-col items-center justify-center gap-1 p-3">
                <span className="text-3xl">👤</span>
                <span className="text-sm md:text-base text-center leading-tight">{p.name}</span>
                {role === 'picker' && (todo > 0 || busy > 0) && (
                  <span className="text-[11px] font-semibold text-blue-500">
                    {todo > 0 && `${todo} to pick`}{todo > 0 && busy > 0 && ' · '}{busy > 0 && `${busy} picking`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Department helpers — the database stores Accessories as 'assembly'.
export const DEPARTMENTS = [
  { value: 'machinery', label: 'Machinery',   short: 'Mach.', icon: '🔧' },
  { value: 'assembly',  label: 'Accessories', short: 'Acc.',  icon: '🔩' },
] as const;

const KEY = 'dept';

export const deptInfo = (d?: string | null) =>
  DEPARTMENTS.find(x => x.value === d) || DEPARTMENTS[0];

export const deptLabel = (d?: string | null) => {
  const x = deptInfo(d);
  return `${x.icon} ${x.label}`;
};

export const otherDept = (d?: string | null) =>
  (deptInfo(d).value === 'machinery' ? 'assembly' : 'machinery');

export function getRememberedDept(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function rememberDept(d: string) {
  try { localStorage.setItem(KEY, d); } catch { /* storage unavailable */ }
}

export const isDept = (d?: string | null): d is string =>
  !!d && DEPARTMENTS.some(x => x.value === d);

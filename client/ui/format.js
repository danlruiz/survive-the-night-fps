// How the UI writes numbers, times and durations.

// a count, with thousands separated: 12,480
export const num = (n) => (n | 0).toLocaleString('en-US');

// '2 h ago' and the like, from a time (ms or anything Date takes)
export function ago(t) {
  const ms = typeof t === 'number' ? t : new Date(t).getTime();
  if (!(ms > 0)) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 45) return `${Math.round(s / 86400)} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// '3 h 20 min', '12 min', '40 s'
export function duration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

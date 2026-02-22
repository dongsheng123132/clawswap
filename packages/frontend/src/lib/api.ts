const API_URL = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL ?? '' : '';

export function getApiUrl(path: string): string {
  const base = API_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

const TOKEN_KEY = 'hospardo_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Errore ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = `/api${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    url += `?${qs}`;
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      setToken(null);
      window.dispatchEvent(new Event('hospardo:logout'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

/** Messaggio leggibile da un errore API (inclusi errori di validazione) */
export function errorMessage(err) {
  if (err?.body?.details && Array.isArray(err.body.details)) {
    return `${err.message}: ${err.body.details.map((d) => d.message).join('; ')}`;
  }
  return err?.message || 'Errore imprevisto';
}

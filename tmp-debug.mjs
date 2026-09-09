const fs = await import('node:fs');
const path = await import('node:path');
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value.replace(/^['"]|['"]$/g, '');
  }
}

const state = new Map();
const makeResponse = ({ data = [], error = null, status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ data, error }),
  text: async () => JSON.stringify({ data, error })
});

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = String(init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;
  if (url.includes('/rest/v1/monitor_state')) {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      state.set(body.key, body.value);
      return makeResponse({ data: [body] });
    }
    const params = new URLSearchParams(url.split('?')[1] || '');
    const key = params.get('key');
    if (key) {
      const actualKey = key.replace(/^eq\./, '');
      const value = state.get(actualKey);
      if (params.get('select') === 'value') {
        return makeResponse({ data: value === undefined ? [] : [{ value }], error: value === undefined ? { code: 'PGRST116' } : null });
      }
      return makeResponse({ data: value === undefined ? [] : [{ key: actualKey, value }], error: value === undefined ? { code: 'PGRST116' } : null });
    }
  }
  return makeResponse({ data: [], error: null });
};

const { setMonitorState, getMonitorState } = await import('./lib/db.ts');
console.log('before', Array.from(state.entries()));
await setMonitorState('db_audit_test', 'ok');
console.log('after', Array.from(state.entries()));
console.log('read result', await getMonitorState('db_audit_test'));

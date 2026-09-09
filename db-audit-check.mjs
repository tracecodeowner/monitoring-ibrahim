const fs = await import('node:fs');
const path = await import('node:path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
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
const posts = new Map();
const subs = new Map();
const requestLog = [];

const makeResponse = ({ data = [], error = null, status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ data, error }),
  text: async () => JSON.stringify(data)
});

const parseQuery = (url) => {
  try {
    const [base, query = ''] = String(url).split('?');
    return { base, params: new URLSearchParams(query) };
  } catch {
    return { base: String(url), params: new URLSearchParams() };
  }
};

const getEqValue = (params, keyName) => {
  const raw = params.get(keyName) || '';
  if (!raw) return null;
  const match = raw.match(/^eq\.(.+)$/i);
  return match ? decodeURIComponent(match[1]) : decodeURIComponent(raw);
};

const makeTableRow = (row) => ({
  id: row.id ?? row.key ?? 1,
  ...row
});

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = String(init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;
  const { base, params } = parseQuery(url);

  requestLog.push({ method, url, body, base, params: Object.fromEntries(params.entries()) });

  if (base.includes('/rest/v1/monitor_state')) {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      if (!body || !body.key) {
        throw new Error('monitor_state upsert missing key');
      }
      state.set(body.key, body.value);
      return makeResponse({ data: [body] });
    }

    const keyFilter = getEqValue(params, 'key');
    if (keyFilter) {
      const row = state.get(keyFilter);
      if (params.get('select') === 'value') {
        return makeResponse({
          data: row === undefined ? null : { value: row },
          error: row === undefined ? { code: 'PGRST116' } : null
        });
      }
      return makeResponse({
        data: row === undefined ? [] : [{ key: keyFilter, value: row }],
        error: row === undefined ? { code: 'PGRST116' } : null
      });
    }

    return makeResponse({
      data: Array.from(state.entries()).map(([key, value]) => ({ key, value })),
      error: null
    });
  }

  if (base.includes('/rest/v1/monitor_posts')) {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      if (!body || !body.id) {
        throw new Error('monitor_posts write missing id');
      }
      posts.set(body.id, body);
      return makeResponse({ data: [body] });
    }

    const idFilter = getEqValue(params, 'id');
    if (idFilter) {
      const match = posts.get(idFilter);
      if (params.get('select') === 'id') {
        return makeResponse({
          data: match ? { id: match.id } : null,
          error: match ? null : { code: 'PGRST116' }
        });
      }
      return makeResponse({
        data: match ? [{ id: match.id }] : [],
        error: match ? null : { code: 'PGRST116' }
      });
    }

    return makeResponse({
      data: Array.from(posts.values()).map((row) => ({
        id: row.id,
        username: row.username,
        text: row.text,
        created_at: row.created_at,
        score: row.score,
        severity: row.severity,
        matches: row.matches,
        url: row.url
      })),
      error: null
    });
  }

  if (base.includes('/rest/v1/push_subscriptions')) {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      if (!body || !body.endpoint) {
        throw new Error('push_subscriptions write missing endpoint');
      }
      subs.set(body.endpoint, body);
      return makeResponse({ data: [body] });
    }

    return makeResponse({
      data: Array.from(subs.values()).map((row) => ({ id: 1, subscription: row.subscription })),
      error: null
    });
  }

  return makeResponse({ data: [], error: null });
};

const { ensureSchema, getMonitorState, setMonitorState, insertMonitorPost, hasMonitorPost, listPushSubscriptions, upsertPushSubscription } = await import('./lib/db.ts');

const results = [];

const record = async (name, fn) => {
  const recordStart = requestLog.length;
  try {
    const value = await fn();
    results.push({ name, pass: true, value });
    console.log(`${name}: PASS`);
  } catch (error) {
    results.push({ name, pass: false, error: String(error) });
    console.log(`${name}: FAIL`);
    console.log('  error=', String(error));
    console.log('  trace=', JSON.stringify(requestLog.slice(recordStart), null, 2));
  }
};

await record('ensureSchema', async () => {
  await ensureSchema();
  const stateReadReq = requestLog.filter((entry) => entry.url.includes('/rest/v1/monitor_state'));
  const keySelectSeen = stateReadReq.some((entry) => /select=key|key=eq\./i.test(entry.url));
  if (!keySelectSeen) throw new Error('monitor_state query did not use key');
  return 'ok';
});

await record('getMonitorState', async () => {
  await setMonitorState('db_audit_test', 'ok');
  const value = await getMonitorState('db_audit_test');
  const stateReqs = requestLog.filter((entry) => entry.url.includes('/rest/v1/monitor_state'));
  if (stateReqs.some((entry) => /id=eq\./i.test(entry.url))) {
    throw new Error('monitor_state request used id instead of key');
  }
  if (!stateReqs.some((entry) => /key=eq\./i.test(entry.url))) {
    throw new Error('monitor_state request did not use key filter');
  }
  if (value !== 'ok') throw new Error(`expected monitor_state value "ok" but got ${String(value)}`);
  return value;
});

await record('setMonitorState', async () => {
  await setMonitorState('db_audit_test', 'ok');
  const keyEntry = requestLog.findLast((entry) => entry.url.includes('/rest/v1/monitor_state') && (entry.method === 'POST' || entry.method === 'PUT' || entry.method === 'PATCH'));
  if (!keyEntry || !keyEntry.body || keyEntry.body.key !== 'db_audit_test') {
    throw new Error('monitor_state write missing key field');
  }
  if (state.get('db_audit_test') !== 'ok') {
    throw new Error('monitor_state map did not store expected value');
  }
  return 'ok';
});

await record('insertMonitorPost', async () => {
  await insertMonitorPost({
    id: 'db-audit-post-1',
    username: 'ibamarief',
    text: 'release key test',
    created_at: '2026-09-10T00:00:00Z',
    score: 10,
    severity: 'HIGH',
    matches: ['release key'],
    url: 'https://example.com/post/1'
  });
  if (!posts.has('db-audit-post-1')) {
    throw new Error('monitor_posts insert did not persist id');
  }
  return 'ok';
});

await record('hasMonitorPost', async () => {
  const exists = await hasMonitorPost('db-audit-post-1');
  const postReqs = requestLog.filter((entry) => entry.url.includes('/rest/v1/monitor_posts'));
  if (!postReqs.some((entry) => /id=eq\./i.test(entry.url))) {
    throw new Error('monitor_posts existence check did not use id filter');
  }
  if (!exists) throw new Error('monitor_posts existence check returned false for inserted row');
  return exists;
});

await record('listPushSubscriptions', async () => {
  await upsertPushSubscription('https://example.com/push/endpoint/test', {
    keys: { auth: 'auth', p256dh: 'p256dh' }
  });
  const rows = await listPushSubscriptions();
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('push subscription list did not return exactly one row');
  }
  if (!rows[0].subscription || !rows[0].subscription.keys) {
    throw new Error('push subscription list did not include expected subscription payload');
  }
  return rows;
});

await record('upsertPushSubscription', async () => {
  const endpoint = 'https://example.com/push/endpoint/test';
  await upsertPushSubscription(endpoint, { keys: { auth: 'auth', p256dh: 'p256dh' } });
  const match = subs.get(endpoint);
  if (!match || !match.endpoint || !match.subscription) {
    throw new Error('push subscription upsert did not persist endpoint and payload');
  }
  return 'ok';
});

const allPass = results.every((entry) => entry.pass);
console.log('---');
console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
process.exit(allPass ? 0 : 1);

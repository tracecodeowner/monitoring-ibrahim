import assert from 'node:assert/strict';
import { runMonitorCheck, type MonitorPost, type MonitorRuntimeDeps, type MonitorSource } from '../lib/monitor';

const makePost = ({
  id,
  username = 'ibamarief',
  text = 'release key package',
  created_at = '2026-09-10T00:00:00Z',
  url = `https://example.com/post/${id}`
}: {
  id: string;
  username?: string;
  text?: string;
  created_at?: string;
  url?: string;
}): MonitorPost => ({
  id,
  username,
  text,
  created_at,
  score: 0,
  severity: 'LOW',
  matches: [],
  url
});

type MockNotification = { title: string; body: string; url: string };

const runWithMockedDeps = async ({
  sources,
  existingIds = new Set<string>(),
  notifications = [] as MockNotification[]
}: {
  sources: MonitorSource[];
  existingIds?: Set<string>;
  notifications?: MockNotification[];
}) => {
  const persisted = new Map<string, true>();
  for (const id of existingIds) persisted.set(id, true);

  const sent = [...notifications];

  const deps: Partial<MonitorRuntimeDeps> = {
    sources,
    hasMonitorPost: async (id: string) => persisted.has(id),
    insertMonitorPost: async (post: MonitorPost) => {
      persisted.set(post.id, true);
    },
    setMonitorState: async () => {},
    sendPush: async (title: string, body: string, url: string) => {
      sent.push({ title, body, url });
      return { skipped: false, reason: null };
    }
  } as Partial<MonitorRuntimeDeps>;

  const summary = await runMonitorCheck(deps);
  return { summary, persisted, notifications: sent };
};

const testNewPost = async () => {
  const source: MonitorSource = {
    name: 'mock-one',
    fetchLatestPosts: async () => [makePost({ id: 'new-1', text: 'release key details from ibamarief' })]
  };

  const { summary, persisted, notifications } = await runWithMockedDeps({ sources: [source] });

  assert.equal(summary.newPosts, 1, 'new post count should be 1');
  assert.equal(summary.fetchedPosts, 1, 'fetched post count should be 1');
  assert.equal(persisted.size, 1, 'exactly one post should be persisted');
  assert.equal(notifications.length, 1, 'one notification should be sent for HIGH/MEDIUM posts');

  return { name: 'New post', pass: true, logicalInserts: 1, notifications: notifications.length };
};

const testCrossSourceDeduplication = async () => {
  const samePost = makePost({ id: 'dup-1', text: 'release key package from ibamarief' });
  const sourceA: MonitorSource = { name: 'mock-a', fetchLatestPosts: async () => [samePost] };
  const sourceB: MonitorSource = { name: 'mock-b', fetchLatestPosts: async () => [samePost] };

  const { summary, persisted, notifications } = await runWithMockedDeps({ sources: [sourceA, sourceB] });

  assert.equal(summary.newPosts, 1, 'cross-source duplicates should collapse to one logical insert');
  assert.equal(persisted.size, 1, 'duplicate sources must not create multiple persisted rows');
  assert.equal(notifications.length, 1, 'duplicate notification should not fire twice');

  return { name: 'Cross-source deduplication', pass: true, logicalInserts: 1, notifications: notifications.length };
};

const testSecondRunDeduplication = async () => {
  const post = makePost({ id: 'repeat-1', text: 'release key package from ibamarief' });

  const first = await runWithMockedDeps({ sources: [{ name: 'mock-first', fetchLatestPosts: async () => [post] }] });
  const second = await runWithMockedDeps({
    sources: [{ name: 'mock-first', fetchLatestPosts: async () => [post] }],
    existingIds: new Set(first.persisted.keys())
  });

  assert.equal(first.summary.newPosts, 1, 'first run should insert the post');
  assert.equal(second.summary.newPosts, 0, 'second run should insert zero new posts');
  assert.equal(second.notifications.length, 0, 'second run should send zero duplicate notifications');

  return { name: 'Second-run deduplication', pass: true, logicalInserts: 0, notifications: 0 };
};

const testSeverityAndDuplicateNotifications = async () => {
  const posts = [
    makePost({ id: 'high-1', text: 'release key package is urgent', url: 'https://example.com/high-1' }),
    makePost({ id: 'medium-1', text: 'passphrase recovery note', url: 'https://example.com/medium-1' }),
    makePost({ id: 'low-1', text: 'hello world', url: 'https://example.com/low-1' })
  ];

  const first = await runWithMockedDeps({ sources: [{ name: 'mock-sev', fetchLatestPosts: async () => posts }] });
  const second = await runWithMockedDeps({
    sources: [{ name: 'mock-sev', fetchLatestPosts: async () => [posts[0], posts[1]] }],
    existingIds: new Set(first.persisted.keys())
  });

  assert.equal(first.summary.highPriority, 1, 'HIGH post should be eligible for notification');
  assert.equal(first.summary.mediumPriority, 1, 'MEDIUM post should be eligible for notification');
  assert.equal(first.summary.lowPriority, 1, 'LOW post should not trigger notification');
  assert.equal(first.notifications.length, 2, 'HIGH and MEDIUM should notify once each');
  assert.equal(second.notifications.length, 0, 'duplicate HIGH/MEDIUM post should not re-notify');

  return { name: 'Severity/notification behavior', pass: true, logicalInserts: 3, notifications: first.notifications.length };
};

const testSourceFailureIsolation = async () => {
  const goodSource: MonitorSource = {
    name: 'good-source',
    fetchLatestPosts: async () => [makePost({ id: 'healthy-1', text: 'release key recovery message' })]
  };
  const badSource: MonitorSource = {
    name: 'bad-source',
    fetchLatestPosts: async () => {
      throw new Error('upstream timeout');
    }
  };

  const { summary, notifications } = await runWithMockedDeps({ sources: [goodSource, badSource] });

  assert.equal(summary.successfulSources, 1, 'healthy source should succeed despite one failing source');
  assert.equal(summary.failedSources, 1, 'source failure should be reported in source metadata');
  assert.equal(summary.newPosts, 1, 'healthy source should still insert its valid post');
  assert.equal(summary.sources.some((entry) => entry.name === 'bad-source' && !entry.ok), true, 'failed source must appear in health metadata');
  assert.equal(notifications.length, 1, 'healthy post should still trigger exactly one notification');

  return { name: 'Source failure isolation', pass: true, logicalInserts: 1, notifications: notifications.length };
};

async function main() {
  const tests = [
    await testNewPost(),
    await testCrossSourceDeduplication(),
    await testSecondRunDeduplication(),
    await testSeverityAndDuplicateNotifications(),
    await testSourceFailureIsolation()
  ];

  const failing = tests.filter((entry) => !entry.pass);
  if (failing.length > 0) {
    console.error('FAILURES');
    for (const entry of failing) console.error(entry);
    process.exit(1);
  }

  for (const entry of tests) {
    console.log(`${entry.name}: PASS`);
  }

  console.log(JSON.stringify({
    tests: tests.map((entry) => ({
      name: entry.name,
      pass: entry.pass,
      logicalInserts: entry.logicalInserts,
      notifications: entry.notifications
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

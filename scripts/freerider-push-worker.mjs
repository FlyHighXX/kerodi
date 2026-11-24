#!/usr/bin/env node
/**
 * Single-device Freerider push worker with multiple on-demand listeners.
 *
 * The worker exposes a small HTTP control API so the app can start/stop
 * From/To listeners with an expiry. One feed poll serves all active sessions.
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

const API_URL = 'https://hertzfreerider.se/api/transport-routes/';
const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL ?? 'https://api.expo.dev/v2/push/send';
const DEFAULT_POLL_SECONDS = clampSeconds(process.env.POLL_SECONDS ?? 10);
const SESSIONS_FILE = process.env.SESSIONS_FILE ?? './.freerider-sessions.json';
const HISTORY_FILE = process.env.HISTORY_FILE ?? './.freerider-history.json';
const CONTROL_HOST = process.env.CONTROL_HOST ?? '0.0.0.0';
const CONTROL_PORT = Number(process.env.CONTROL_PORT ?? 8787);
const MAX_TRANSITIONS = 50;

let sessionsCache;
let historyCache;
let firstPollWithSessions = true;

function clampSeconds(value) {
  const number = Number(value);
  return Math.min(3600, Math.max(1, Number.isFinite(number) ? Math.round(number) : 10));
}

function clampMinutes(value) {
  const number = Number(value);
  return Math.min(60 * 24, Math.max(1, Number.isFinite(number) ? Math.round(number) : 60));
}

function foldText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõöøœ]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[çć]/g, 'c')
    .replace(/[ñń]/g, 'n')
    .replace(/æ/g, 'ae')
    .trim();
}

function matchesLocationQuery(location, query) {
  const needle = foldText(query);
  if (!needle) return true;
  const haystack = foldText(
    `${location?.name ?? ''} ${location?.city ?? ''} ${location?.country ?? ''} ${location?.tracCode ?? ''}`,
  );
  return haystack.includes(needle);
}

function normalizeRoutes(groups) {
  const routes = [];
  for (const group of groups) {
    for (const route of group.routes ?? []) {
      if (!route?.pickupLocation || !route?.returnLocation) continue;
      routes.push({
        ...route,
        pickupName: route.pickupLocation.name?.trim() || group.pickupLocationName || 'Unknown pickup',
        returnName: route.returnLocation.name?.trim() || group.returnLocationName || 'Unknown return',
      });
    }
  }
  return routes;
}

function buildRouteUrl(route) {
  const timestamp = Date.parse(route.availableAt);
  const params = [`id=${encodeURIComponent(String(route.id))}`];
  if (Number.isFinite(timestamp)) {
    params.push(`date=${encodeURIComponent(String(timestamp))}`);
  }
  return `https://hertzfreerider.se/booking-flow#${params.join('&')}`;
}

async function fetchRoutes() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15 * 1000);
  try {
    const response = await fetch(API_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    return normalizeRoutes(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function locationSearchText(location) {
  return foldText(
    `${location?.name ?? ''} ${location?.city ?? ''} ${location?.country ?? ''} ${location?.tracCode ?? ''}`,
  );
}

function cityName(location) {
  return location?.city?.trim() || location?.name?.trim() || 'Unknown';
}

function historyRouteFields(route) {
  return {
    id: route.id,
    transportOfferId: route.transportOfferId,
    pickupName: route.pickupName,
    returnName: route.returnName,
    fromCity: cityName(route.pickupLocation),
    toCity: cityName(route.returnLocation),
    fromSearchText: locationSearchText(route.pickupLocation),
    toSearchText: locationSearchText(route.returnLocation),
    country: route.pickupLocation.country ?? '',
    distance: route.distance,
    travelTime: route.travelTime,
    availableAt: route.availableAt,
    latestReturn: route.latestReturn,
    expireTime: route.expireTime,
    carModel: route.carModel,
  };
}

function makeHistoryRecord(route, now, countsTowardPatterns) {
  return {
    ...historyRouteFields(route),
    discoveredAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
    status: 'active',
    countsTowardPatterns,
    transitions: countsTowardPatterns
      ? [{ at: now, status: 'active', kind: 'detected' }]
      : [],
    reappearanceCount: 0,
    totalUnavailableMs: 0,
  };
}

function historyIsExpired(record, now) {
  const timestamp = Date.parse(record.expireTime);
  return Number.isFinite(timestamp) && now >= timestamp;
}

function historyStatusFor(present, expireTime, now) {
  if (present) return 'active';
  return historyIsExpired({ expireTime }, now) ? 'expired' : 'unavailable';
}

function applyHistoryTransition(record, status, now) {
  if (record.status === status) return record;

  const kind =
    status === 'active'
      ? record.transitions?.length
        ? 'available-again'
        : 'detected'
      : status;

  let reappearanceCount = record.reappearanceCount ?? 0;
  let totalUnavailableMs = record.totalUnavailableMs ?? 0;
  let lastUnavailableAt = record.lastUnavailableAt;
  let lastReappearedAt = record.lastReappearedAt;

  if (status === 'active') {
    if (lastUnavailableAt) {
      totalUnavailableMs += Math.max(0, now - lastUnavailableAt);
      lastUnavailableAt = undefined;
    }
    if (kind === 'available-again') {
      reappearanceCount += 1;
      lastReappearedAt = now;
    }
  } else if (record.status === 'active') {
    lastUnavailableAt = now;
  }

  const transitions = [
    ...(Array.isArray(record.transitions) ? record.transitions : []),
    { at: now, status, kind },
  ].slice(-MAX_TRANSITIONS);

  return {
    ...record,
    status,
    disappearedAt: status === 'active' ? undefined : record.disappearedAt ?? now,
    transitions,
    reappearanceCount,
    totalUnavailableMs,
    lastUnavailableAt,
    lastReappearedAt,
    updatedAt: now,
  };
}

async function readHistory() {
  if (historyCache) return historyCache;
  try {
    const parsed = JSON.parse(await readFile(HISTORY_FILE, 'utf8'));
    historyCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    historyCache = {};
  }
  return historyCache;
}

async function writeHistory(history) {
  historyCache = history;
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

async function reconcileHistory(routes, now) {
  const history = await readHistory();
  const baseline = Object.keys(history).length === 0;
  const currentIds = new Set(routes.map((route) => route.id));
  const reappearedIds = new Set();
  let changed = false;

  for (const route of routes) {
    const key = String(route.id);
    const existing = history[key];
    if (!existing) {
      history[key] = makeHistoryRecord(route, now, !baseline);
      changed = true;
      continue;
    }

    const refreshed = {
      ...existing,
      ...historyRouteFields(route),
      firstSeenAt: existing.firstSeenAt ?? existing.discoveredAt ?? now,
      discoveredAt: existing.discoveredAt ?? now,
      lastSeenAt: now,
      updatedAt: now,
    };
    const updated = applyHistoryTransition(refreshed, 'active', now);
    if (updated !== refreshed && updated.transitions.length > refreshed.transitions.length) {
      reappearedIds.add(route.id);
    }
    history[key] = updated;
    changed = true;
  }

  // Re-check inactive rows too, so unavailable becomes expired once expireTime passes.
  for (const [key, record] of Object.entries(history)) {
    const nextStatus = historyStatusFor(currentIds.has(record.id), record.expireTime, now);
    const updated = applyHistoryTransition(record, nextStatus, now);
    if (updated !== record) {
      history[key] = updated;
      changed = true;
    }
  }

  if (changed) await writeHistory(history);
  return { history, reappearedIds };
}

async function readSessions() {
  if (sessionsCache) return sessionsCache;
  try {
    const parsed = JSON.parse(await readFile(SESSIONS_FILE, 'utf8'));
    sessionsCache = Array.isArray(parsed)
      ? parsed.filter((session) => session && typeof session.id === 'string')
      : [];
  } catch {
    sessionsCache = [];
  }
  return sessionsCache;
}

async function writeSessions(sessions) {
  sessionsCache = sessions;
  await writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

function pruneSessions(sessions) {
  const now = Date.now();
  return sessions.filter((session) => Number(session.expiresAt) > now);
}

function publicSession(session) {
  return {
    id: session.id,
    from: session.from,
    to: session.to,
    pollSeconds: session.pollSeconds,
    durationMinutes: session.durationMinutes,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

async function startSession(input) {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!token) throw new Error('token is required');

  const from = typeof input.from === 'string' ? input.from.trim() : '';
  const to = typeof input.to === 'string' ? input.to.trim() : '';
  const durationMinutes = clampMinutes(input.durationMinutes ?? 60);
  const pollSeconds = clampSeconds(input.pollSeconds ?? DEFAULT_POLL_SECONDS);

  // Baseline at start so existing routes never produce an immediate alert.
  const currentIds = (await fetchRoutes()).map((route) => route.id);
  const now = Date.now();
  const sessions = pruneSessions(await readSessions());
  const expiresAt = now + durationMinutes * 60 * 1000;

  const existing = sessions.find(
    (session) =>
      session.token === token &&
      foldText(session.from) === foldText(from) &&
      foldText(session.to) === foldText(to),
  );

  if (existing) {
    existing.durationMinutes = durationMinutes;
    existing.pollSeconds = pollSeconds;
    existing.expiresAt = expiresAt;
    existing.seenRouteIds = currentIds;
    if (!Array.isArray(existing.notifiedReappearanceKeys)) {
      existing.notifiedReappearanceKeys = [];
    }
    await writeSessions(sessions);
    return publicSession(existing);
  }

  const session = {
    id: randomUUID(),
    token,
    from,
    to,
    durationMinutes,
    pollSeconds,
    createdAt: now,
    expiresAt,
    seenRouteIds: currentIds,
    notifiedReappearanceKeys: [],
  };
  sessions.push(session);
  await writeSessions(sessions);
  return publicSession(session);
}

async function stopSession(input) {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!token || !id) throw new Error('token and id are required');

  const sessions = pruneSessions(await readSessions());
  const remaining = sessions.filter((session) => !(session.token === token && session.id === id));
  await writeSessions(remaining);
  return { ok: true };
}

async function listSessions(token) {
  const sessions = pruneSessions(await readSessions());
  await writeSessions(sessions);
  return sessions
    .filter((session) => session.token === token)
    .map(publicSession)
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function sendPush(token, matches, kind = 'new') {
  const first = matches[0];
  const availableAgain = kind === 'available-again';
  const title = availableAgain
    ? matches.length === 1
      ? 'Freerider route available again'
      : `${matches.length} Freerider routes available again`
    : matches.length === 1
      ? 'New Freerider route'
      : `${matches.length} new Freerider routes`;
  const summary =
    matches.length === 1
      ? `${first.pickupName} → ${first.returnName}`
      : `${first.pickupName} → ${first.returnName} and ${matches.length - 1} more`;
  const body = availableAgain ? `Back: ${summary}` : summary;

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: 'default',
      channelId: 'freerider',
      data: {
        routeId: first.id,
        url: buildRouteUrl(first),
        matchCount: matches.length,
        kind,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Expo push failed: ${JSON.stringify(payload.errors ?? response.status)}`);
  }
}

function addToGroup(grouped, token, route) {
  const existing = grouped.get(token) ?? new Map();
  if (!existing.has(route.id)) existing.set(route.id, route);
  grouped.set(token, existing);
}

async function sendGroups(grouped, kind) {
  for (const [token, routeMap] of grouped) {
    const matches = [...routeMap.values()];
    try {
      await sendPush(token, matches, kind);
      const suffix = kind === 'available-again' ? ' available again' : ' new';
      console.log(`Sent alert for ${matches.length}${suffix} route(s).`);
    } catch (error) {
      console.error(`Push failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function pollOnce() {
  const sessions = pruneSessions(await readSessions());
  await writeSessions(sessions);
  if (sessions.length === 0) return 2;

  const now = Date.now();
  const routes = await fetchRoutes();
  const { history, reappearedIds } = await reconcileHistory(routes, now);
  // A restart can find routes already back in the feed; log the change but don't alert for it.
  const notifyReappeared = firstPollWithSessions ? new Set() : reappearedIds;
  firstPollWithSessions = false;
  const currentIds = routes.map((route) => route.id);
  const newGroups = new Map();
  const againGroups = new Map();

  const transitionAt = (routeId) => {
    const record = history[String(routeId)];
    const last = record?.transitions?.[record.transitions.length - 1];
    return last?.at ?? now;
  };

  for (const session of sessions) {
    const seen = new Set(
      Array.isArray(session.seenRouteIds)
        ? session.seenRouteIds.filter((id) => typeof id === 'number')
        : [],
    );
    const matchesFilters = (route) =>
      matchesLocationQuery(route.pickupLocation, session.from) &&
      matchesLocationQuery(route.returnLocation, session.to);

    // Reappearing routes get their own alert; exclude them from the new-route alert.
    const newMatches = routes.filter(
      (route) => !seen.has(route.id) && !notifyReappeared.has(route.id) && matchesFilters(route),
    );
    const againMatches = routes.filter(
      (route) => notifyReappeared.has(route.id) && matchesFilters(route),
    );

    session.seenRouteIds = currentIds;

    const notified = new Set(
      Array.isArray(session.notifiedReappearanceKeys)
        ? session.notifiedReappearanceKeys.filter((key) => typeof key === 'string')
        : [],
    );
    for (const route of againMatches) {
      const key = `${route.id}:${transitionAt(route.id)}`;
      if (notified.has(key)) continue;
      notified.add(key);
      addToGroup(againGroups, session.token, route);
    }
    session.notifiedReappearanceKeys = [...notified].slice(-200);

    for (const route of newMatches) addToGroup(newGroups, session.token, route);
  }

  await writeSessions(sessions);
  await sendGroups(newGroups, 'new');
  await sendGroups(againGroups, 'available-again');

  return Math.min(...sessions.map((session) => clampSeconds(session.pollSeconds)));
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {});
      return;
    }

    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const body = request.method === 'POST' ? await readBody(request) : {};

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, sessions: (await readSessions()).length });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/start') {
      const session = await startSession(body);
      sendJson(response, 200, { session });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/stop') {
      await stopSession(body);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/status') {
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const since = Number(body.since) || 0;
      const history = Object.values(await readHistory()).filter(
        (record) => (record.updatedAt ?? 0) > since,
      );
      sendJson(response, 200, { sessions: await listSessions(token), history });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request' });
  }
});

let running = true;
function shutdown() {
  if (!running) return;
  running = false;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(CONTROL_PORT, CONTROL_HOST, () => {
  console.log(
    `Freerider session worker listening on http://${CONTROL_HOST}:${CONTROL_PORT} ` +
      `(poll default=${DEFAULT_POLL_SECONDS}s, sessions=${SESSIONS_FILE}, history=${HISTORY_FILE})`,
  );
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

while (running) {
  let delay = 5;
  try {
    delay = await pollOnce();
  } catch (error) {
    console.error(`Poll failed: ${error instanceof Error ? error.message : error}`);
  }
  await sleep(delay * 1000);
}

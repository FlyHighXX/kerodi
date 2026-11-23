#!/usr/bin/env node
/**
 * Minimal single-device Freerider push worker.
 *
 * Polls the public Hertz Freerider feed and sends an Expo push notification
 * when a new route matches FROM and TO. State is kept in a local JSON file.
 */

import { readFile, writeFile } from 'node:fs/promises';

const API_URL = 'https://hertzfreerider.se/api/transport-routes/';
const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL ?? 'https://api.expo.dev/v2/push/send';
const TOKEN = process.env.EXPO_PUSH_TOKEN;
const FROM = process.env.FROM ?? '';
const TO = process.env.TO ?? '';
const POLL_SECONDS = Math.max(1, Number(process.env.POLL_SECONDS ?? 10) || 10);
const SEEN_FILE = process.env.SEEN_FILE ?? './.freerider-seen.json';

if (!TOKEN) {
  console.error('EXPO_PUSH_TOKEN is required. Use "Turn on" in the app to get it.');
  process.exit(1);
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

async function loadSeen() {
  try {
    const raw = await readFile(SEEN_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'number') : []);
  } catch {
    return new Set();
  }
}

async function saveSeen(ids) {
  await writeFile(SEEN_FILE, JSON.stringify([...ids]), 'utf8');
}

async function sendPush(matches) {
  const first = matches[0];
  const title = matches.length === 1 ? 'New Freerider route' : `${matches.length} new Freerider routes`;
  const body =
    matches.length === 1
      ? `${first.pickupName} → ${first.returnName}`
      : `${first.pickupName} → ${first.returnName} and ${matches.length - 1} more`;

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: TOKEN,
      title,
      body,
      sound: 'default',
      channelId: 'freerider',
      data: { routeId: first.id, url: buildRouteUrl(first) },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Expo push failed: ${JSON.stringify(payload.errors ?? response.status)}`);
  }
}

async function check(seen) {
  const response = await fetch(API_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Feed returned ${response.status}`);

  const routes = normalizeRoutes(await response.json());
  const currentIds = new Set(routes.map((route) => route.id));

  if (seen.size === 0) {
    await saveSeen(currentIds);
    console.log(`Baseline saved: ${currentIds.size} routes. No alert sent on first run.`);
    return;
  }

  const matches = routes.filter(
    (route) =>
      !seen.has(route.id) &&
      matchesLocationQuery(route.pickupLocation, FROM) &&
      matchesLocationQuery(route.returnLocation, TO),
  );

  await saveSeen(currentIds);

  if (matches.length === 0) return;
  await sendPush(matches);
  console.log(`Sent alert for ${matches.length} new route(s).`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;
process.on('SIGINT', () => {
  running = false;
});
process.on('SIGTERM', () => {
  running = false;
});

console.log(
  `Freerider push worker started. From="${FROM}" To="${TO}" interval=${POLL_SECONDS}s seen=${SEEN_FILE}`,
);

let seen = await loadSeen();
while (running) {
  try {
    await check(seen);
    seen = await loadSeen();
  } catch (error) {
    console.error(`Check failed: ${error instanceof Error ? error.message : error}`);
  }
  await sleep(POLL_SECONDS * 1000);
}

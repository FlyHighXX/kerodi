/**
 * Layer on top of the public data that powers hertzfreerider.se.
 *
 * The site's route search reads `/api/transport-routes/` without authentication,
 * so we can show the same offers natively and add our own filtering/new-route
 * detection on top. Booking still happens on hertzfreerider.se.
 */

export const FREERIDER_API_URL = 'https://hertzfreerider.se/api/transport-routes/';
export const FREERIDER_SITE_URL = 'https://hertzfreerider.se/';

export type FreerideLocation = {
  name: string;
  tracCode: string;
  country: string;
  city: string;
};

type FreerideRouteResponse = {
  id: number;
  transportOfferId: number;
  pickupLocation: FreerideLocation;
  returnLocation: FreerideLocation;
  priorityOrder: number;
  /** Kilometres. */
  distance: number;
  originalDistance: number;
  /** Minutes. */
  travelTime: number;
  originalTravelTime: number;
  /** Local wall-clock time, without a timezone suffix. */
  availableAt: string;
  latestReturn: string;
  expireTime: string;
  carModel: string;
  publicDescription: string;
  publicInformation: string;
};

type FreerideRouteGroup = {
  pickupLocationName: string;
  returnLocationName: string;
  routes: FreerideRouteResponse[];
};

export type RouteOffer = FreerideRouteResponse & {
  pairKey: string;
  pickupName: string;
  returnName: string;
};

export type RoutePair = {
  key: string;
  pickupName: string;
  returnName: string;
  country: string;
  count: number;
};

export function makePairKey(pickupCode: string, returnCode: string) {
  return `${pickupCode}__${returnCode}`;
}

/** Flatten the site's grouped response into one list of searchable offers. */
export function normalizeRoutes(groups: FreerideRouteGroup[]): RouteOffer[] {
  const routes: RouteOffer[] = [];

  for (const group of groups) {
    for (const route of group.routes ?? []) {
      if (!route.pickupLocation || !route.returnLocation) continue;
      routes.push({
        ...route,
        pairKey: makePairKey(route.pickupLocation.tracCode, route.returnLocation.tracCode),
        pickupName:
          route.pickupLocation.name?.trim() || group.pickupLocationName || 'Unknown pickup',
        returnName:
          route.returnLocation.name?.trim() || group.returnLocationName || 'Unknown return',
      });
    }
  }

  return routes.sort((a, b) => a.availableAt.localeCompare(b.availableAt));
}

/** One entry per pickup/return pair, for the filter list. */
export function buildRoutePairs(routes: RouteOffer[]): RoutePair[] {
  const byKey = new Map<string, RoutePair>();

  for (const route of routes) {
    const existing = byKey.get(route.pairKey);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byKey.set(route.pairKey, {
      key: route.pairKey,
      pickupName: route.pickupName,
      returnName: route.returnName,
      country: route.pickupLocation.country?.toUpperCase() ?? '',
      count: 1,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.pickupName.localeCompare(b.pickupName) || a.returnName.localeCompare(b.returnName),
  );
}

export async function fetchFreeriderRoutes(signal?: AbortSignal): Promise<RouteOffer[]> {
  const response = await fetch(FREERIDER_API_URL, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`hertzfreerider.se returned ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected response from hertzfreerider.se');
  }

  return normalizeRoutes(payload as FreerideRouteGroup[]);
}

export function filterRoutes(
  routes: RouteOffer[],
  selectedPairKeys: ReadonlySet<string>,
  newOnly: boolean,
  newIds: ReadonlySet<number>,
) {
  return routes.filter((route) => {
    if (selectedPairKeys.size > 0 && !selectedPairKeys.has(route.pairKey)) return false;
    if (newOnly && !newIds.has(route.id)) return false;
    return true;
  });
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The API sends local times with no zone; parsing them as Date would shift them. */
export function formatLocalDateTime(raw: string) {
  const [date, time] = raw.split('T');
  if (!date || !time) return raw;
  const [year, month, day] = date.split('-');
  const [hour, minute] = time.split(':');
  const monthLabel = MONTHS[Number(month) - 1] ?? month;
  return `${day} ${monthLabel} ${year} · ${hour}:${minute}`;
}

export function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

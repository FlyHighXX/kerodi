/**
 * Layer on top of the public data that powers hertzfreerider.se.
 *
 * The site's route search reads `/api/transport-routes/` and `/api/locations/`
 * without authentication, so we can show the same offers natively and add our
 * own filtering/new-route detection on top. Booking still happens on
 * hertzfreerider.se.
 */

export const FREERIDER_API_URL = 'https://hertzfreerider.se/api/transport-routes/';
export const FREERIDER_LOCATIONS_URL = 'https://hertzfreerider.se/api/locations/';
export const FREERIDER_SITE_URL = 'https://hertzfreerider.se/';

// Shared between the foreground tab and the background notification task.
export const SEEN_ROUTES_KEY = 'kerodi.freerider.seen.v1';
export const LOCATION_FILTERS_KEY = 'kerodi.freerider.location-filters.v1';
export const POLL_SECONDS_KEY = 'kerodi.freerider.poll-seconds.v1';
export const NOTIFIED_ROUTES_KEY = 'kerodi.freerider.notified.v1';
export const NOTIFICATIONS_ENABLED_KEY = 'kerodi.freerider.notifications-enabled.v1';

export type FreerideLocation = {
  name: string;
  tracCode: string;
  country: string;
  city?: string | null;
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
  pickupName: string;
  returnName: string;
};

/**
 * The site deep-links into its booking flow with a hash:
 * `/booking-flow#id=<routeId>&date=<epochMillis>`.
 * `availableAt` is a local wall-clock string, so parsing it on the device gives
 * the same local time that the site's date formatter expects.
 */
export function buildFreeriderRouteUrl(route: RouteOffer) {
  const timestamp = Date.parse(route.availableAt);
  const params = [`id=${encodeURIComponent(String(route.id))}`];
  if (Number.isFinite(timestamp)) {
    params.push(`date=${encodeURIComponent(String(timestamp))}`);
  }
  return `${FREERIDER_SITE_URL}booking-flow#${params.join('&')}`;
}

/** Flatten the site's grouped response into one list of searchable offers. */
export function normalizeRoutes(groups: FreerideRouteGroup[]): RouteOffer[] {
  const routes: RouteOffer[] = [];

  for (const group of groups) {
    for (const route of group.routes ?? []) {
      if (!route.pickupLocation || !route.returnLocation) continue;
      routes.push({
        ...route,
        pickupName:
          route.pickupLocation.name?.trim() || group.pickupLocationName || 'Unknown pickup',
        returnName:
          route.returnLocation.name?.trim() || group.returnLocationName || 'Unknown return',
      });
    }
  }

  return routes.sort((a, b) => a.availableAt.localeCompare(b.availableAt));
}

/** Case- and diacritic-insensitive text used for both suggestions and filtering. */
export function foldText(value: string) {
  return value
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

export function locationSearchText(location: Pick<FreerideLocation, 'name' | 'tracCode' | 'country' | 'city'>) {
  return foldText(
    `${location.name ?? ''} ${location.city ?? ''} ${location.country ?? ''} ${location.tracCode ?? ''}`,
  );
}

/** A query like "Stockholm" matches every store whose name or city contains it. */
export function matchesLocationQuery(
  location: Pick<FreerideLocation, 'name' | 'tracCode' | 'country' | 'city'>,
  query: string,
) {
  const needle = foldText(query);
  return needle.length === 0 || locationSearchText(location).includes(needle);
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

/** The full store list from the site's own locations endpoint. */
export async function fetchFreeriderLocations(signal?: AbortSignal): Promise<FreerideLocation[]> {
  const response = await fetch(FREERIDER_LOCATIONS_URL, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`hertzfreerider.se returned ${response.status} for locations`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected locations response from hertzfreerider.se');
  }

  const byName = new Map<string, FreerideLocation>();
  for (const item of payload as FreerideLocation[]) {
    if (!item?.name || !item.tracCode) continue;
    if (!byName.has(item.name)) byName.set(item.name, item);
  }

  return [...byName.values()].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

export function filterRoutes(
  routes: RouteOffer[],
  fromQuery: string,
  toQuery: string,
  newOnly: boolean,
  newIds: ReadonlySet<number>,
  /** Offer ids in the order they were discovered, newest first. */
  newOrder: readonly number[],
) {
  const discoveryRank = new Map(newOrder.map((id, index) => [id, index]));
  const hasFrom = foldText(fromQuery).length > 0;
  const hasTo = foldText(toQuery).length > 0;

  return routes
    .filter((route) => {
      if (hasFrom && !matchesLocationQuery(route.pickupLocation, fromQuery)) return false;
      if (hasTo && !matchesLocationQuery(route.returnLocation, toQuery)) return false;
      if (newOnly && !newIds.has(route.id)) return false;
      return true;
    })
    .sort((a, b) => {
      const aRank = discoveryRank.get(a.id);
      const bRank = discoveryRank.get(b.id);

      // Newly discovered offers are grouped at the top in detection order.
      if (aRank !== undefined || bRank !== undefined) {
        if (aRank === undefined) return 1;
        if (bRank === undefined) return -1;
        return aRank - bRank;
      }

      return a.availableAt.localeCompare(b.availableAt);
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

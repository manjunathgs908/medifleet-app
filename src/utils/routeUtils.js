// Real driving route (distance + duration + polyline) via medifleet-backend's
// Directions proxy — same endpoint savelife-web/savelife-app already use, so
// the key stays server-side. This app had no route/polyline utility of its
// own before now (savelife-app's routeUtils.js is a separate repo, no code
// shared between them).
const DIRECTIONS_API = 'https://api.savelife.health/api/places/directions';

// Decodes Google's encoded polyline format into [{latitude, longitude}, ...]
// for react-native-maps' <Polyline>. Standard algorithm, same implementation
// already used in savelife-web/lib/pricing.js and savelife-app/routeUtils.js.
export function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// from/to: {latitude, longitude}. Returns null on any failure — this is
// display-only (the route line on the driver's map), never used for fare,
// so there's no money-rule fallback concern here; a failed fetch just means
// no polyline is drawn this tick, not a crash.
export async function getRouteInfo(from, to) {
  try {
    const res = await fetch(
      `${DIRECTIONS_API}?originLat=${from.latitude}&originLng=${from.longitude}&destLat=${to.latitude}&destLng=${to.longitude}`
    );
    const data = await res.json();
    if (!data.success || typeof data.distanceKm !== 'number') return null;
    return {
      distanceKm: data.distanceKm,
      durationSec: data.durationSec ?? null,
      coords: data.polyline ? decodePolyline(data.polyline) : [],
    };
  } catch {
    return null;
  }
}

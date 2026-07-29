// src/utils/tripResponse.js
// ============================================================
// Shared accept/reject sequence for a dispatched-but-not-yet-confirmed
// trip. Single source of truth for both TripAssignedScreen.js
// (DriverDashboard poll-triggered) and IncomingTripScreen.js (full-screen
// push-triggered) — same API calls, same order, same self-heal reasoning,
// so there is exactly one implementation of this behavior, not two.
// ============================================================
import { tripsApi } from '../api/client';

// Accepting a trip now IS starting it — there's no separate "Trip Started"
// tap anymore, so chain straight into the en_route transition (this is
// what fires the customer's "Ambulance On The Way" push and sets
// enRouteAt server-side). Best-effort: if this one-shot call doesn't land
// (network blip), DriverDashboard's own poll loop retries it automatically
// every 15s until it does, so the driver is never stuck on a
// confirmed-but-still-'dispatched' trip with no button to advance it.
export async function acceptTrip(tripId) {
  const { data } = await tripsApi.confirm(tripId);
  let confirmedTrip = data.trip;
  try {
    const { data: startedData } = await tripsApi.updateStatus(tripId, 'en_route');
    confirmedTrip = startedData.trip;
  } catch (startErr) {
    // Silent — DriverDashboard's poll-loop self-heal retries this.
  }
  return confirmedTrip;
}

export async function rejectTrip(tripId) {
  await tripsApi.decline(tripId);
}

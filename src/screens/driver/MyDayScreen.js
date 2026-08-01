import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { tripsApi, assignmentsApi } from '../../api/client';

const TICK_MS = 30000; // re-render cadence for the live duty-hours ticker — no network call, just Date.now()

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfWeek(d) {
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // days back to Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function fmtDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

// Mirrors endDuty's own break-adjusted calculation exactly (models/index.js
// counterpart: controllers/assignmentController.js) — a live preview of a
// number that isn't persisted yet, not a second formula. The instant the
// shift actually ends, the server's own totalWorkingMinutes supersedes
// this client-computed figure.
function liveElapsedMinutes(shift, now) {
  const breaksMs = (shift.breaks || []).reduce((sum, b) => {
    const end = b.endedAt ? new Date(b.endedAt) : now;
    return sum + Math.max(0, end - new Date(b.startedAt));
  }, 0);
  const totalMs = now - new Date(shift.shiftStart);
  return Math.max(0, (totalMs - breaksMs) / 60000);
}

function computeStats(trips, shifts, activeShift, now) {
  const windows = {
    today: startOfDay(now),
    week : startOfWeek(now),
    month: startOfMonth(now),
  };

  const stats = {};
  for (const key of Object.keys(windows)) {
    const cutoff = windows[key];
    const tripsInWindow = trips.filter((t) => t.completedAt && new Date(t.completedAt) >= cutoff);
    const shiftsInWindow = shifts.filter((s) => s.shiftStart && new Date(s.shiftStart) >= cutoff);

    let dutyMinutes = shiftsInWindow.reduce((sum, s) => sum + (s.totalWorkingMinutes || 0), 0);
    // Live in-progress shift attributed to whichever window its own
    // shiftStart falls into — same "which day did he report for duty"
    // bucketing rule endDuty's auto-attendance write uses.
    if (activeShift?.shiftStart && new Date(activeShift.shiftStart) >= cutoff) {
      dutyMinutes += liveElapsedMinutes(activeShift, now);
    }

    stats[key] = {
      tripsCompleted: tripsInWindow.length,
      totalDistanceKm: tripsInWindow.reduce((sum, t) => sum + (t.distanceKm || 0), 0),
      dutyMinutes,
      collection: tripsInWindow.reduce((sum, t) => sum + (t.grandTotal || 0), 0),
    };
  }
  return stats;
}

export default function MyDayScreen({ navigation }) {
  // Raw fetched data, not derived stats — stats are recomputed at render
  // time (below) so the ticker can advance the live in-progress shift's
  // elapsed minutes every TICK_MS without a network call. Storing
  // pre-computed stats in state would freeze the live figure between
  // fetches, defeating the point of the ticker.
  const [rawData, setRawData] = useState(null); // { trips, shifts, activeShift }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0); // forces a re-render every TICK_MS so the live duty clock visibly moves

  const load = useCallback(async () => {
    const now = new Date();
    // Padded 3 days before this month's start — getTrips filters on
    // createdAt (booking time), not completedAt (actual completion).
    // A trip booked just before a day/week/month boundary but completed
    // just after it would be missed by a tight createdAt window; the pad
    // is a generous safety margin (ambulance dispatch is essentially
    // always same-day booking-to-completion), and the real windowing
    // below is done precisely against completedAt client-side regardless.
    const fetchFrom = new Date(startOfMonth(now).getTime() - 3 * 86400000);

    const [tripsRes, shiftsRes, activeRes] = await Promise.all([
      tripsApi.getAll({ status: 'completed', from: fetchFrom.toISOString(), to: now.toISOString(), limit: 500 }),
      assignmentsApi.getMyShifts({ from: startOfMonth(now).toISOString(), limit: 200 }),
      assignmentsApi.getMyActiveShift(),
    ]);

    setRawData({
      trips: tripsRes.data.trips || [],
      shifts: shiftsRes.data.shifts || [],
      activeShift: activeRes.data.shift || null,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          await load();
        } catch (err) {
          // Silent — screen just keeps whatever it last had (or the
          // loading spinner, on a first-ever failed load).
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      // Live ticker — a driver mid-shift should see duty hours climbing
      // while this screen is open, not frozen until he ends duty.
      const t = setInterval(() => setTick((x) => x + 1), TICK_MS);
      return () => { cancelled = true; clearInterval(t); };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      // Silent — same as above.
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#10b981" style={{ marginTop: 60 }} />
      </View>
    );
  }

  // Recomputed on every render (including every tick) from a fresh
  // Date.now() — this is what actually makes the live duty clock advance.
  const stats = rawData
    ? computeStats(rawData.trips, rawData.shifts, rawData.activeShift, new Date())
    : null;

  const sections = [
    { key: 'today', title: 'Today' },
    { key: 'week',  title: 'This Week' },
    { key: 'month', title: 'This Month' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Day</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {sections.map(({ key, title }) => {
          const s = stats?.[key];
          if (!s) return null;
          return (
            <View key={key} style={styles.card}>
              <Text style={styles.cardTitle}>{title}</Text>
              <View style={styles.statGrid}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{s.tripsCompleted}</Text>
                  <Text style={styles.statLabel}>Trips</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{s.totalDistanceKm.toFixed(1)} km</Text>
                  <Text style={styles.statLabel}>Distance</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{fmtDuration(s.dutyMinutes)}</Text>
                  <Text style={styles.statLabel}>Duty Hours</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, styles.collectionValue]}>₹{Math.round(s.collection).toLocaleString('en-IN')}</Text>
                  <Text style={styles.statLabel}>Collection</Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Collection is what the customer paid, collected on SaveLife's
            behalf — not the driver's pay. SaveLife drivers are on fixed
            salary; this screen deliberately never shows earnings/payout. */}
        <Text style={styles.footnote}>Collection is the amount customers paid — not your pay.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backTxt: { color: '#9ca3af', fontSize: 14, width: 50 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  content: { padding: 12, paddingBottom: 40 },

  card: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', marginBottom: 12 },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
  collectionValue: { color: '#10b981' },
  statLabel: { color: '#6b7280', fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  footnote: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
});

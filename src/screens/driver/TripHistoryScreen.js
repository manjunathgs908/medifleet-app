import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SectionList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { tripsApi } from '../../api/client';

const PAGE_LIMIT = 20;

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// Groups the flat, accumulated (paginated) trip list into day sections —
// re-derived from the full list on every page load rather than
// incrementally patched, since the backend sorts by createdAt (booking
// time) while grouping is by completedAt (actual completion) — for the
// rare trip where those differ, this still lands it in the correct day
// section rather than accumulating drift across pages.
function groupByDay(trips) {
  const byDay = new Map();
  trips.forEach((t) => {
    const key = new Date(t.completedAt).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(t);
  });
  const sections = Array.from(byDay.entries())
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .map(([key, data]) => ({
      title: `${dayLabel(data[0].completedAt)} — ${data.length} trip${data.length === 1 ? '' : 's'}`,
      data: data.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)),
    }));
  return sections;
}

export default function TripHistoryScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (pageNum, { replace } = {}) => {
    const { data } = await tripsApi.getAll({ status: 'completed', page: pageNum, limit: PAGE_LIMIT });
    const fetched = data.trips || [];
    setTrips((prev) => (replace ? fetched : [...prev, ...fetched]));
    setHasMore(pageNum < (data.totalPages || 1));
    setPage(pageNum);
  }, []);

  // Reload from page 1 every time the screen gains focus — a trip
  // completed elsewhere (e.g. right before navigating here) should show
  // up without a manual pull.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          await load(1, { replace: true });
        } catch (err) {
          // Silent — the list just stays on whatever it last had.
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load(1, { replace: true });
    } catch (err) {
      // Silent — same as above.
    } finally {
      setRefreshing(false);
    }
  };

  const onEndReached = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      await load(page + 1);
    } catch (err) {
      // Silent — next scroll-to-end retries.
    } finally {
      setLoadingMore(false);
    }
  };

  const sections = groupByDay(trips);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#10b981" style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trip History</Text>
        <View style={{ width: 50 }} />
      </View>

      {sections.length === 0 ? (
        <Text style={styles.emptyTxt}>No completed trips yet.</Text>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('TripDetail', { trip: item })}
            >
              <View style={styles.rowTop}>
                <Text style={styles.time}>{timeLabel(item.completedAt)}</Text>
                <Text style={styles.tripNumber}>{item.tripNumber}</Text>
              </View>
              <Text style={styles.patient}>{item.patientName || 'N/A'}</Text>
              <Text style={styles.route} numberOfLines={1}>
                {item.pickup?.address || 'N/A'} → {item.dropHospital?.name || item.dropAddress || 'N/A'}
              </Text>
              <View style={styles.rowBottom}>
                <Text style={styles.km}>{item.distanceKm != null ? `${item.distanceKm} km` : '—'}</Text>
                <Text style={styles.fare}>₹{(item.grandTotal || 0).toLocaleString('en-IN')}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color="#10b981" style={{ marginVertical: 16 }} />
          ) : null}
        />
      )}
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

  sectionHeader: {
    color: '#9ca3af', fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.4, backgroundColor: '#0a0f1e', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8,
  },

  row: {
    backgroundColor: '#111827', borderRadius: 14, padding: 14, marginHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  time: { color: '#6b7280', fontSize: 12, fontFamily: 'monospace' },
  tripNumber: { color: '#6b7280', fontSize: 12, fontFamily: 'monospace' },
  patient: { color: '#fff', fontSize: 15, fontWeight: '600' },
  route: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  km: { color: '#9ca3af', fontSize: 12.5 },
  fare: { color: '#10b981', fontSize: 14, fontWeight: '700' },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 30 },
});

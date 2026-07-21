import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ambulancesApi } from '../../api/client';
import { AMBULANCE_DOC_TYPES } from '../../constants/ambulanceServiceTypes';

const STATUS_COLORS = {
  available: '#10b981',
  assigned : '#f59e0b',
  maintenance: '#ef4444',
};

function docCompleteness(documents) {
  const uploaded = AMBULANCE_DOC_TYPES.filter(({ docType }) => documents?.[docType]?.url).length;
  return `${uploaded}/${AMBULANCE_DOC_TYPES.length} docs`;
}

export default function MyAmbulancesScreen({ navigation }) {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await ambulancesApi.getAll();
      setAmbulances(data?.ambulances || []);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load ambulances.');
    }
  }, []);

  // useFocusEffect (not a plain mount-only useEffect) so returning from
  // AmbulanceDetailScreen after adding a photo/document refreshes this
  // list's counts instead of showing stale data until a manual pull-down.
  useFocusEffect(
    useCallback(() => {
      (async () => { setLoading(true); await load(); setLoading(false); })();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  function renderItem({ item }) {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('AmbulanceDetail', { ambulanceId: item._id })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.regNumber}>{item.registrationNumber}</Text>
          <Text style={styles.typeLabel}>{item.serviceTypeLabel || item.serviceType}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaTxt}>{item.year || '—'}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaTxt}>{item.photos?.length || 0} photo{item.photos?.length === 1 ? '' : 's'}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaTxt}>{docCompleteness(item.documents)}</Text>
          </View>
          {item.assignedDriver?.name && (
            <Text style={styles.driverTxt}>🧑‍✈️ {item.assignedDriver.name}</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status] || '#6b7280'}22`, borderColor: `${STATUS_COLORS[item.status] || '#6b7280'}55` }]}>
          <Text style={[styles.statusTxt, { color: STATUS_COLORS[item.status] || '#9ca3af' }]}>{item.status}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Ambulances</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AddAmbulance')}>
          <Text style={styles.addTxt}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={ambulances}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          ListEmptyComponent={<Text style={styles.emptyTxt}>No ambulances yet. Tap "+ Add" to register one.</Text>}
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
  backTxt: { color: '#9ca3af', fontSize: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  addTxt: { color: '#10b981', fontSize: 14, fontWeight: 'bold' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  regNumber: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  typeLabel: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  metaTxt: { color: '#6b7280', fontSize: 11.5 },
  metaDot: { color: '#374151', fontSize: 11.5 },
  driverTxt: { color: '#6b7280', fontSize: 11.5, marginTop: 4 },

  statusBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1 },
  statusTxt: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
});

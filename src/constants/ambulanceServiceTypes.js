// Mirrors medifleet-backend/utils/ambulanceServiceTypes.js exactly — the
// 7 medical/body entries match the live Pricing collection's serviceType
// values 1:1 (cross-checked directly against the DB and savelife-app's
// ambulanceCatalog.js). HEARSE/FREEZER_BOX are vehicle-level categories:
// one physical vehicle covers all 3 of their per-trip pricing sub-types
// (Basic/Standard/Luxury, Normal/Standard/VIP) — no separate entries for
// those. Standby/Event ambulance are service modes on existing vehicles,
// deliberately not listed. Keep this in sync with the backend if it changes.
export const AMBULANCE_SERVICE_TYPES = [
  { serviceType: 'BLS',        label: 'BLS Ambulance — Maruti Eeco' },
  { serviceType: 'BLS_TEMPO',  label: 'BLS Ambulance — Tempo Traveller' },
  { serviceType: 'ALS_TEMPO',  label: 'ALS Ambulance — Tempo Traveller' },
  { serviceType: 'ACLS_TEMPO', label: 'ACLS Ambulance — Tempo Traveller' },
  { serviceType: 'NICU_TEMPO', label: 'NICU Ambulance — Tempo Traveller' },
  { serviceType: 'BODY_TEMPO', label: 'Body Shifting Ambulance — Tempo Traveller' },
  { serviceType: 'BODY_MINI',  label: 'Body Shifting Mini — Maruti Eeco' },
  { serviceType: 'HEARSE',      label: 'Hearse (Basic / Standard / Luxury)' },
  { serviceType: 'FREEZER_BOX', label: 'Freezer Box (Normal / Standard / VIP)' },
];

// documents.pollution is the PUC (Pollution Under Control) certificate —
// key kept as `pollution` to match the backend's existing docType list;
// only this label says "PUC".
export const AMBULANCE_DOC_TYPES = [
  { docType: 'rc',        label: 'RC (Registration Certificate)' },
  { docType: 'insurance', label: 'Insurance' },
  { docType: 'fitness',   label: 'Fitness Certificate' },
  { docType: 'permit',    label: 'Permit' },
  { docType: 'pollution', label: 'PUC (Pollution Under Control)' },
];

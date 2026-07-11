# MediFleet Driver App — Project Report

**Project:** `medifleet-app` (Expo / React Native, SDK 56)
**Reviewed:** 2026-07-11
**Companion projects:** `medifleet-backend` (Express/MongoDB API), `savelife-app` (customer-facing booking app), `medifleet-frontend` (web CRM, not reviewed here)

---

## 1. Overview

MediFleet is a two-role mobile app (Driver / Telecaller) that talks to the `medifleet-backend` Express API at `https://api.savelife.health/api`. It is a thin client: 4 screens total, no offline storage beyond the auth token, no state management library (plain React state + one Context for auth).

| Metric | Value |
|---|---|
| Screens | 4 (`LoginScreen`, `DriverDashboard`, `BookingTripScreen`, `TelecallerDashboard`) |
| Navigators | 1 stack (`App.js`), each role gets exactly one screen — no in-role navigation stack |
| Global state | `AuthContext` only |
| API layer | `src/api/client.js` (axios) — partially used; several screens bypass it |
| Confirmed critical bugs | 3 (see §6) |
| Backend endpoints the app never calls | 6+ (see §5, §4) |

---

## 2. Folder Structure

```
medifleet-app/
├── App.js                        Root navigator — role-based routing
├── index.js                      Expo entry point (registerRootComponent)
├── app.json                      Expo config (permissions, EAS project)
├── eas.json                      EAS Build profiles
├── package.json / package-lock.json
├── AGENTS.md                     Note: "Expo has changed" — read v56 docs before coding
├── CLAUDE.md                     "@AGENTS.md" — delegates to AGENTS.md
├── LICENSE                       Generic Expo MIT template license (unmodified)
├── .gitignore
├── .claude/
│   └── settings.json             Enables the "expo" Claude Code plugin
├── assets/
│   ├── icon.png, favicon.png, splash-icon.png
│   └── android-icon-{foreground,background,monochrome}.png
├── src/
│   ├── api/
│   │   └── client.js             Axios instance + tripsApi/authApi/attendanceApi/salaryApi/tripActivityApi/advanceApi
│   ├── context/
│   │   └── AuthContext.js        login()/logout(), AsyncStorage-backed session
│   └── screens/
│       ├── LoginScreen.js        Phone+password, role picker (driver/telecaller)
│       ├── driver/
│       │   ├── DriverDashboard.js       Duty shift, expenses, advances, live trip
│       │   └── BookingTripScreen.js     7-stage patient-trip tracker
│       └── telecaller/
│           └── TelecallerDashboard.js   Trip list + "create booking" modal
├── dist/                         Generated `expo export` output — NOT source, gitignored
└── .expo/                       Local Expo CLI cache/dev-server state — NOT source, gitignored
```

No `babel.config.js` or `metro.config.js` exists in the project. This is likely fine on recent Expo/Metro versions (which default to `babel-preset-expo` without an explicit config file), but it's worth a quick sanity check against Expo SDK 56's actual requirement before assuming it's intentional.

---

## 3. Screen Flow

```
                         ┌────────────────┐
                         │  LoginScreen   │
                         │ (role picker:  │
                         │ driver/telecaller)
                         └───────┬────────┘
                                 │ login() succeeds
                                 ▼
              user.role === 'driver'      user.role === 'telecaller'
                     │                            │
                     ▼                            ▼
          ┌─────────────────────┐        ┌───────────────────────┐
          │   DriverDashboard    │        │  TelecallerDashboard   │
          │  - Start/End 12hr    │        │  - Trip list (all)     │
          │    shift (selfie)    │        │  - "+ New Booking"     │
          │  - Add Expense modal │        │    modal → create trip │
          │  - Request Advance   │        └───────────────────────┘
          │  - Live trip actions │
          │  - "Booking Trip" ──►│───────► BookingTripScreen
          └─────────────────────┘         (7-stage patient trip:
                                            Start → Reached Hospital →
                                            Patient Picked → Start Patient
                                            Trip → Client Dropped →
                                            Return Started → Close Duty,
                                            + cancel-request flow)
```

Every screen also has a **Logout** button that calls `AuthContext.logout()`, clearing AsyncStorage and dropping the user back to `LoginScreen` (this part works correctly since `App.js` re-renders `AppNavigator` on `user` state change).

---

## 4. Navigation Flow

Navigation is **not** typical React Navigation stack-per-role — it's a single top-level `Stack.Navigator` in `App.js` that swaps its single `<Stack.Screen>` based on `user.role`:

```js
if (user.role === 'driver')     → <Stack.Screen name="DriverDashboard" .../>
if (user.role === 'telecaller') → <Stack.Screen name="TelecallerDashboard" .../>
else                            → <Stack.Screen name="Login" .../>
```

- `BookingTripScreen` is **not** a navigator route at all — `DriverDashboard` renders it conditionally via local state (`showBookingTrip`) and an `onBack` prop callback, effectively hand-rolling navigation instead of using `navigation.navigate()`/`goBack()`. This means:
  - No native back-gesture/hardware-back support on Android for this screen.
  - No deep-linking or state restoration possible for it.
  - It won't show up in navigation devtools.
- There is no navigator nesting for driver/telecaller sub-flows — if more screens are added per role (e.g., a payslip screen, a trip-history screen), the current architecture has no stack to slot them into; each would need the same manual `show*` boolean + prop-drilled `onBack` pattern, which won't scale.
- `AppContext`/`AppNavigator` re-derives the visible tree from `user.role` on every render — there's no `Splash`/loading screen transition guard against a flicker between "loading" and "no user" states beyond the single `ActivityIndicator` gate in `App.js` (this part is fine).

**Recommendation:** give each role its own nested `Stack.Navigator` (`DriverStack`, `TelecallerStack`) so `BookingTripScreen` becomes a real route (`navigation.navigate('BookingTrip')`) instead of a conditionally-rendered component.

---

## 5. API Mapping

### `src/api/client.js` bindings vs. backend routes

| Client function | HTTP call | Backend route | Controller | Used in app? |
|---|---|---|---|---|
| `authApi.login(phone, password)` | `POST /auth/login` | `routes/auth.js` → `authController.loginPassword` | ✅ `LoginScreen` |
| `authApi.me()` | `GET /auth/me` | `authController.getMe` | ❌ **never called** — no session re-validation after app relaunch |
| `tripsApi.getLive()` | `GET /trips/live` | `tripController.getLiveBoard` | ✅ `DriverDashboard` |
| `tripsApi.getAll(params)` | `GET /trips` | `tripController.getTrips` | ✅ `TelecallerDashboard` |
| `tripsApi.updateStatus(id, status)` | `PUT /trips/:id/status` | `tripController.updateStatus` | ✅ `DriverDashboard` (⚠️ see Bug #2) |
| `tripsApi.complete(id, data)` | `PUT /trips/:id/complete` | `tripController.completeTrip` | ❌ **never called anywhere** — see Bug #2 |
| — (no `create` method exists) | — | `tripController.createTrip` (`POST /trips`) | ⚠️ **called anyway** as `tripsApi.create(form)` in `TelecallerDashboard` — **this throws** (see Bug #1) |
| `attendanceApi.clockIn()` / `clockOut()` | `POST /attendance/clock-in` / `clock-out` | `routes/attendance.js` (stub handlers, not wired to a controller) | ❌ **never called** — Dashboard instead logs `START_12HR_SHIFT`/`END_12HR_SHIFT` via `tripActivityApi.log()` |
| `salaryApi.getPayslip(id, m, y)` | `GET /salary/:driverId/:month/:year` | `salaryController.getPayslip` | ❌ **never called** — no payslip screen exists |
| `tripActivityApi.log(data)` | `POST /trip-activity/log` | `tripActivityController.logActivity` | ✅ `DriverDashboard` (shift start/end, expenses) |
| `advanceApi.request(data)` | `POST /advances` | `advanceController.requestAdvance` | ✅ `DriverDashboard` |
| `advanceApi.myAdvances()` | `GET /advances/my` | `advanceController.myAdvances` | ❌ **never called** — driver can request an advance but never see request history/status |

### Raw `api.*` calls that bypass the `client.js` wrapper objects

`BookingTripScreen.js` calls the shared axios instance directly instead of adding methods to `client.js`:

| Call site | HTTP call | Backend route |
|---|---|---|
| `api.get('/booking-trips/my')` | `GET /booking-trips/my` | `bookingTripController.myTrips` |
| `api.post('/booking-trips', {...})` | `POST /booking-trips` | `bookingTripController.createTrip` |
| `api.put('/booking-trips/:id/stage', {...})` | `PUT /booking-trips/:id/stage` | `bookingTripController.updateStage` |

This is an architectural inconsistency (see §7) — two different calling conventions for the same kind of network call, in the same app.

### Backend capability the app has zero UI for

- `POST /api/auth/send-otp` + `POST /api/auth/verify-otp` — OTP login exists server-side and is documented as the primary driver auth method in the backend README, but the app only implements password login.
- `GET /api/vehicles*` — fleet/vehicle info, compliance docs. No vehicle screen.
- `GET /api/hospitals` — tie-up hospital list. Telecaller's "Pickup Address" is free text with no hospital picker.
- `GET/PUT /api/billing/*`, `GET /api/finance/*` — no financial views (expected — owner-only in the backend's RBAC matrix, and there's no "owner" role screen at all in this app).
- Any `Notification` retrieval — compliance/EMI alerts generated by the backend's cron scheduler are never surfaced to any client.

---

## 6. Bugs

Ranked by severity. File paths are relative to `medifleet-app/`.

### 🔴 Critical

**1. `TelecallerDashboard.handleCreateTrip` calls a method that doesn't exist → creating a trip always crashes/fails.**
`src/screens/telecaller/TelecallerDashboard.js:40` calls `tripsApi.create(form)`, but `src/api/client.js`'s `tripsApi` object only defines `getLive`, `getAll`, `updateStatus`, `complete` — there is no `create`. This throws `TypeError: tripsApi.create is not a function` every time a telecaller tries to submit the "New Booking" form, which is the screen's entire purpose.
**Fix:** add `create: (data) => api.post('/trips', data)` to `tripsApi` in `client.js`.

**2. A driver can never actually complete a trip from the app — the status machine is unreachable.**
Backend `tripController.updateStatus` (`medifleet-backend/controllers/tripController.js:222`) only allows: `dispatched → en_route`, and `en_route → completed | cancelled`. But `DriverDashboard.handleTripStatus` (`src/screens/driver/DriverDashboard.js:80`) only ever sends `'en_route'` (mapped from the `TRIP_STARTED` button) or `'CLIENT_DROPPED'` (from the "Client Dropped" button, sent verbatim). `'CLIENT_DROPPED'` is not a valid `Trip.status` value (it's a `BookingTrip`/`TripActivity` **stage** key, mixed in here by mistake) — the backend will reject it with a 400 every single time. Because `tripsApi.complete()` is never called anywhere in the app, no trip booked via the Telecaller flow can ever reach `completed` status (and therefore never generates a `Bill`/`Income` record) purely from mobile-app interactions.
**Fix:** wire the "Client Dropped" button to `tripsApi.complete(tripId, data)` instead of `updateStatus(tripId, 'CLIENT_DROPPED')`.

**3. Role-mismatch handling in `LoginScreen` references an undefined variable and crashes.**
`src/screens/LoginScreen.js:9` destructures only `const { login } = useAuth();` — `logout` is never destructured. But line 25 calls `await logout();` when the selected role doesn't match the returned user's role. This throws `ReferenceError: logout is not defined`, crashing the login flow right after a successful (but role-mismatched) authentication. Additionally, because `login()` already updates `AuthContext`'s `user` state (and therefore `App.js` already navigated to the dashboard) before this check runs, the "wrong role" Alert — even if it didn't crash — would pop up **on top of the wrong dashboard**, not prevent entry to it.
**Fix:** destructure `logout` from `useAuth()`, and/or move the role check earlier / rely on the backend instead of a client-side role gate.

### 🟠 High

**4. Taking a bill photo for an expense incorrectly starts a duty shift.**
In `DriverDashboard.js`, the Expense modal's "📸 Take Bill Photo" button (line 150) just does `setShowExpense(false); setShowCamera(true);` and reuses the *same* `takeSelfie()` handler (line 62) that the "Start Shift" flow uses. `takeSelfie()` unconditionally calls `logActivity('START_12HR_SHIFT', ...)` and `setDutyStatus('12HR')`. Result: attaching a photo to a diesel/food/repair/police-fine expense will log a spurious shift-start activity and flip the driver's duty status to "on duty," regardless of their actual state.
**Fix:** parameterize the capture handler with a `mode` ('shift-start' | 'bill-photo') and branch its side effects accordingly.

**5. `photoUri` is never actually set — expense photos are silently dropped.**
`photoUri`/`setPhotoUri` (`DriverDashboard.js:23`) is declared and reset in `submitExpense`, but nothing in the camera-capture path (`takeSelfie`, line 62-70) ever calls `setPhotoUri(photo.uri)`. The "✅ Photo ready" confirmation text (line 153) can therefore never appear, and `submitExpense` always sends `imageUrl: null` to the backend — the bill-photo feature is a no-op even before considering Bug #4.

**6. Camera modal opens even when permission is denied.**
`handleStartDuty` (`DriverDashboard.js:57`) calls `requestPermission()` but doesn't check its result before calling `setShowCamera(true)`. If the user denies the permission, the modal still opens and renders a `<CameraView>` that has nothing to show, and `takeSelfie()`'s `cameraRef.takePictureAsync()` is likely to throw or hang rather than failing gracefully.

### 🟡 Medium

**7. "On Trip" duty status is dead code.**
`DriverDashboard.js:186` renders a role/duty label with a branch for `dutyStatus === 'TRIP'` ("🚑 On Trip"), but nothing in the file ever calls `setDutyStatus('TRIP')` — the state machine only ever holds `'OFF'` or `'12HR'`. Either a feature was removed and the leftover branch wasn't cleaned up, or a feature (marking on-trip status) was never wired up.

**8. Trip lookup does an unnecessary double-format defensive check.**
`const myTrip = trips.find(t => t.driver?._id === user?._id || t.driver === user?._id);` (`DriverDashboard.js:112`) suggests uncertainty about whether the backend returns `driver` populated (object) or raw (ObjectId string). This isn't wrong, but it's a code smell indicating the API contract for `GET /trips/live` isn't firmly pinned down — worth confirming with the backend team and simplifying to one shape.

**9. Silent failure on trip-list load.**
Both `DriverDashboard.loadTrips()` and `TelecallerDashboard.loadTrips()` catch fetch errors with only `console.log(e)` — a logged-out/expired-token/offline user sees an empty list with no error banner and no retry affordance.

### 🟢 Low / Informational

**10. `app.json` requests `ACCESS_BACKGROUND_LOCATION`, `NSLocationAlwaysUsageDescription`, and `FOREGROUND_SERVICE`, but the app never performs background location tracking** (only on-demand `getCurrentPositionAsync()` calls). Shipping with unused sensitive permissions is both dead weight and a Play Store policy review risk (Google requires a declared, justified use for background location).
**11. Inconsistent partial localization** — Kannada phrases are hardcoded inline in alerts/placeholders (`"Amount ಹಾಕಿ"`, `"Reason ಹಾಕಿ..."`, `"ಶುರು ಮಾಡಿ"`) mixed with English UI, rather than a proper i18n layer (contrast with the sibling `savelife-app` project, which has a `LANGUAGES` array + `t()` translation helper).
**12. `client.js`'s `API_URL` is hardcoded to production** (`https://api.savelife.health/api`) with no dev/staging environment switch — every local development session talks to production data.

---

## 7. Duplicate Code

1. **`getLocation()` is duplicated verbatim** between `DriverDashboard.js` (line 36) and `BookingTripScreen.js` (line 44) — identical `expo-location` permission-request + `getCurrentPositionAsync` + fallback-to-`{0,0}` logic. Should be extracted to `src/utils/location.js`.
2. **No shared theme/constants file.** All four screens hardcode the same dark-mode palette (`#0a0f1e`, `#111827`, `#1f2937`, `#374151`, `#10b981`, `#ef4444`, `#9ca3af`, `#f59e0b`, `#3b82f6`, `#6366f1`) directly in each `StyleSheet.create()`. `savelife-app` (the sibling project) solves this with `src/theme/index.js`; this app has no equivalent.
3. **Bottom-sheet modal pattern repeated 4×** — `modalBg`/`modalBox`/`modalTitle`/`input`/confirm-button style blocks are near-identical across the Expense modal, Advance modal (`DriverDashboard.js`), the stage-notes modal (`BookingTripScreen.js`), and the new-booking modal (`TelecallerDashboard.js`). A shared `<BottomSheetModal>` component would remove ~80 lines of duplicated style objects.
4. **Header row pattern repeated** — the "Hello, {user?.name}! / role label / Logout button" header block is duplicated between `DriverDashboard.js` and `TelecallerDashboard.js` with only color/copy differences.
5. **Two different API-calling conventions co-exist** (see §5) — `tripsApi`/`tripActivityApi`/`advanceApi` wrapper objects in some screens vs. raw `api.get/post/put(...)` string paths in `BookingTripScreen.js`. Functionally this isn't "duplicate code" but it is a duplicated *pattern* that should converge on one approach (extend `client.js` with a `bookingTripsApi` object).

---

## 8. Unused Files & Dead Code

| Item | Status |
|---|---|
| `advanceApi.myAdvances()` (`client.js`) | Defined, never called — driver has no way to see their advance-request history/status in-app. |
| `salaryApi.getPayslip()` (`client.js`) | Defined, never called — no payslip/salary screen exists at all. |
| `attendanceApi.clockIn()` / `clockOut()` (`client.js`) | Defined, never called — shift start/end goes through `tripActivityApi.log()` instead, leaving this binding orphaned. |
| `authApi.me()` (`client.js`) | Defined, never called — app never re-validates a cached session against the server. |
| `dutyStatus === 'TRIP'` branch (`DriverDashboard.js:186`) | Unreachable — nothing ever sets this state value. |
| `LICENSE` | Unmodified Expo/650 Industries MIT template license — doesn't reflect this being a proprietary MediFleet CRM app. Either replace with a real license/notice or remove. |
| `assets/splash-icon.png` | Present in `assets/`, but `app.json` has no `"splash"` config block (nor an `expo-splash-screen` plugin entry) referencing it — likely an unused leftover from the Expo template scaffold. Verify whether SDK 56's default splash behavior actually consumes this file implicitly; if not, it's dead weight. |
| `dist/` (build output), `.expo/` (CLI cache) | Not source; both are correctly gitignored. Flagged only so they're not mistaken for reviewable app content — regenerate via `expo export`/`expo start`, never hand-edit or ship from the repo. |
| `AGENTS.md` / `CLAUDE.md` | Dev-tooling notes only (Claude Code guidance), not shipped app code — harmless, no action needed. |

No screen files, components, or API bindings were found to be fully orphaned (unreferenced by any import) beyond the client-side API methods above — the file count is small enough that dead *files* aren't the issue here; dead *bindings and branches* are.

---

## 9. Missing Features

Relative to what the backend already supports and/or what the app's requested permissions imply:

1. **OTP login for drivers** — backend has `send-otp`/`verify-otp` and documents OTP as the primary driver auth method; app only has password login.
2. **Trip completion UI** — no path to `PUT /trips/:id/complete` (see Bug #2); billing/income can never be triggered from the driver app.
3. **Payslip / salary history screen** — `salaryApi.getPayslip` exists client-side with nothing to call it.
4. **Advance-request history/status view** — driver can submit a request but never see if it was approved/rejected.
5. **Attendance/shift history view** — no calendar or list of past clock-in/out records.
6. **Vehicle/fleet info for the assigned driver** — no screen shows the driver's assigned ambulance, its documents, or compliance status.
7. **Hospital picker for Telecaller booking** — pickup/drop-hospital is free-text; no use of `GET /api/hospitals`.
8. **Trip history for drivers** — `DriverDashboard` only shows the live trip; there's no "past trips" list (unlike `BookingTripScreen`, which does show past `BookingTrip`s).
9. **Push notifications** — the backend's `Notification` model + cron-generated compliance/EMI alerts are never surfaced to any mobile client.
10. **Background location tracking** — permissions are requested but no actual background task is implemented (see Bug #10).
11. **Pull-to-refresh** on any trip list (`ScrollView` without `RefreshControl` throughout).
12. **Error/retry UI** for failed network calls — currently swallowed into `console.log`.
13. **Environment configuration** — no dev/staging API URL switch, no `.env`/`app.config.js` externalization of `API_URL`.
14. **Crash reporting / error boundary** (e.g., Sentry) — appropriate for a field-operations tool where crashes directly block a driver's workflow.
15. **Telecaller trip management** — can create trips but has no UI to assign a vehicle/driver, or cancel/complete a trip, despite the backend supporting `PUT /trips/:id/assign` and `/cancel`.

---

## 10. Production Readiness Checklist

| # | Item | Status |
|---|---|---|
| 1 | Fix `tripsApi.create` missing method (Bug #1) | ❌ Not done |
| 2 | Fix unreachable trip-completion flow (Bug #2) | ❌ Not done |
| 3 | Fix `logout` ReferenceError in `LoginScreen` (Bug #3) | ❌ Not done |
| 4 | Separate "start shift selfie" from "expense bill photo" capture flows (Bugs #4, #5) | ❌ Not done |
| 5 | Gate camera modal on actual permission grant (Bug #6) | ❌ Not done |
| 6 | Remove dead `'TRIP'` duty-status branch or implement it | ❌ Not done |
| 7 | Add error/retry UX for failed network calls (not just `console.log`) | ❌ Not done |
| 8 | Externalize `API_URL` per environment (dev/staging/prod) | ❌ Not done |
| 9 | Either implement OTP login or remove the now-orphaned backend OTP path from the driver's expected flow | ❌ Not done |
| 10 | Justify or remove unused background-location / foreground-service permissions before store submission | ❌ Not done |
| 11 | Add crash reporting (Sentry/Bugsnag) | ❌ Not done |
| 12 | Replace generic Expo `LICENSE` with the actual project license/notice | ❌ Not done |
| 13 | Confirm `assets/splash-icon.png` is wired up or remove it | ❌ Not done |
| 14 | Extract shared theme constants + bottom-sheet-modal component (maintainability, not a launch-blocker) | ❌ Not done |
| 15 | Consolidate API-calling convention (`client.js` wrappers vs. raw `api.*` calls) | ❌ Not done |
| 16 | Add pull-to-refresh to trip lists | ❌ Not done |
| 17 | Verify `.env`/secrets are not baked into the client bundle (N/A currently — no secrets found client-side; the backend `.env` is separate and already flagged in the earlier file inventory) | ✅ OK as-is |
| 18 | Confirm production build (`eas build --profile production`) actually boots against a real device, not just Expo Go | ⚠️ Not verified in this review — no device/simulator test was run |
| 19 | RBAC parity check against backend (owner role has no app surface at all — confirm this is intentional, e.g. owner only uses the separate web CRM) | ⚠️ Needs confirmation |
| 20 | Remove or gitignore stray `dist/`/`.expo/` build artifacts before each release tag | ⚠️ Currently gitignored correctly — just confirm they're not accidentally committed |

**Overall assessment: not production-ready.** Two of the three critical bugs (#1 and #2) break the app's two core business workflows — a telecaller cannot create a booking, and a driver cannot complete one. These should block any release until fixed.

---

## Appendix: Files Reviewed

- `App.js`, `index.js`, `app.json`, `eas.json`, `package.json`, `.gitignore`, `LICENSE`, `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`
- `src/api/client.js`
- `src/context/AuthContext.js`
- `src/screens/LoginScreen.js`
- `src/screens/driver/DriverDashboard.js`
- `src/screens/driver/BookingTripScreen.js`
- `src/screens/telecaller/TelecallerDashboard.js`
- Cross-referenced against `medifleet-backend`: `server.js`, `middleware/auth.js`, `controllers/tripController.js`, `controllers/bookingTripController.js`, `controllers/authController.js`, `controllers/advanceController.js`, `controllers/salaryController.js`, `models/index.js`, `routes/*.js`

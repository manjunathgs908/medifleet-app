@AGENTS.md

## Hard rules

- **Never read or edit files outside this repo.** If you need to know a
  backend contract, ask — don't go searching sibling directories or open
  files in `medifleet-backend` (or any other repo) directly.

## Backend contract — wait-charge feature (medifleet-backend, do not guess)

```
PUT /api/trips/:id/arrive-pickup      body { lat, lng } optional
PUT /api/trips/:id/reached-hospital   body { lat, lng }, requires pickupVerified
PUT /api/trips/:id/start-return       no body, round_trip only, requires reachedHospitalAt
```

All three are idempotent — safe to retry on a flaky connection.

Trip fields relevant to this flow:
- `tripType` — `'one_way' | 'round_trip'`
- `arrivedAtPickupAt`, `reachedHospitalAt`, `returnStartedAt` — server-set timestamps
- `pickupVerified` — boolean, set by OTP verification

## Money rule

Never compute or display a wait charge calculated on the device. Rupee
amounts come from the server only.

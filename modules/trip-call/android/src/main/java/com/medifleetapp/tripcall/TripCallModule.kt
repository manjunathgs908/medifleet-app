package com.medifleetapp.tripcall

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ACCOUNT_ID = "medifleet_trip_calls"
private const val ACCOUNT_LABEL = "MediFleet Trips"

/**
 * JS bridge for the self-managed Android Telecom ConnectionService
 * (TripConnectionService/TripConnection). Registered with Expo's module
 * registry via modules/trip-call/expo-module.config.json.
 *
 * Same OnCreate/OnDestroy listener-registration shape as
 * expo-notifications' own NotificationsEmitter.kt (verified against that
 * actual source) — TripConnectionService/TripConnection aren't Module
 * subclasses (they're plain android.telecom.* classes instantiated by the
 * OS, not by Expo), so they reach this instance's sendEvent only via the
 * TripCallBridge singleton.
 */
class TripCallModule : Module(), TripCallListener {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val telecomManager: TelecomManager
    get() = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

  private val phoneAccountHandle: PhoneAccountHandle
    get() = PhoneAccountHandle(
      ComponentName(context, TripConnectionService::class.java),
      ACCOUNT_ID
    )

  override fun definition() = ModuleDefinition {
    Name("TripCall")

    Events("onIncomingCall", "onCallEnded")

    OnCreate {
      TripCallBridge.setListener(this@TripCallModule)
    }

    OnDestroy {
      TripCallBridge.setListener(null)
    }

    // Idempotent — safe to call every app start. Self-managed PhoneAccounts
    // don't need the user to manually enable them in Settings (unlike
    // classic ConnectionManager accounts), so registerPhoneAccount() alone
    // is sufficient; there is no separate "request permission" step here.
    AsyncFunction("registerPhoneAccountAsync") {
      val account = PhoneAccount.builder(phoneAccountHandle, ACCOUNT_LABEL)
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .build()
      telecomManager.registerPhoneAccount(account)
    }

    // data: flat string map — same payload shape the full-screen
    // notification path already uses (tripId, tripNumber, patientName,
    // pickupAddress, dropAddress, distanceKm, fare, selectedType).
    // Returns whether Telecom actually created the connection — not
    // fire-and-forget. addNewIncomingCall() itself returns void and tells
    // us nothing; this waits for TripConnectionService's own native
    // onCreateIncomingConnection/onCreateIncomingConnectionFailed callback
    // (see TripCallBridge.awaitConnectionOutcome), entirely native-side,
    // so it works correctly even when called from a headless background-
    // task bridge, unlike the onIncomingCall JS event (see
    // getLaunchCallDataAsync's comment below).
    AsyncFunction("startIncomingCall") { data: Map<String, String>, promise: Promise ->
      val callExtras = Bundle()
      for ((key, value) in data) {
        callExtras.putString(key, value)
      }

      // Sent both wrapped (the documented mechanism for a
      // ConnectionService's own custom per-call data) and at the top
      // level, so whichever way Android actually surfaces it in
      // onCreateIncomingConnection, it's there — see
      // TripConnectionService's own comment on the receiving side.
      val extras = Bundle(callExtras)
      extras.putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, Bundle(callExtras))

      val tripId = data["tripId"]
      if (tripId == null) {
        // No tripId to key the handshake on — index.js never calls this
        // without one in practice (it returns early otherwise), so this
        // is a defensive fallback, not the expected path. Preserve the
        // old fire-and-forget behavior rather than guessing at an outcome.
        telecomManager.addNewIncomingCall(phoneAccountHandle, extras)
        promise.resolve(false)
        return@AsyncFunction
      }

      // Plain Handler timeout + a resolved guard, not coroutines — this
      // Expo Modules Kotlin version's AsyncFunction lambda isn't a
      // suspend context (confirmed: withTimeoutOrNull/
      // suspendCancellableCoroutine fail to compile here), and the
      // Promise-parameter form is the pattern expo-modules-core's own
      // NativeModulesProxyModule.kt uses for exactly this shape.
      val handler = Handler(Looper.getMainLooper())
      var resolved = false

      val timeoutRunnable = Runnable {
        if (!resolved) {
          resolved = true
          // Clean up the pending entry so a late-arriving Telecom callback
          // (OEM quirk, slow binder) doesn't leave a stale closure sitting
          // in the map forever. Safe even if a callback races in right at
          // this boundary — resolveConnectionOutcome no-ops cleanly either way.
          TripCallBridge.resolveConnectionOutcome(tripId, false)
          promise.resolve(false)
        }
      }

      TripCallBridge.awaitConnectionOutcome(tripId) { success ->
        if (!resolved) {
          resolved = true
          handler.removeCallbacks(timeoutRunnable)
          promise.resolve(success)
        }
      }

      handler.postDelayed(timeoutRunnable, 3000L)
      telecomManager.addNewIncomingCall(phoneAccountHandle, extras)
    }

    // tripId identifies which Connection to act on (TripCallBridge tracks
    // them in a Map, not a single reference — see its own comment for why:
    // a single mutable "current" connection meant Accept/Reject could act
    // on the wrong call whenever more than one existed at once).
    AsyncFunction("answerCall") { tripId: String ->
      TripCallBridge.getConnection(tripId)?.performAnswer()
    }

    AsyncFunction("rejectCall") { tripId: String ->
      TripCallBridge.getConnection(tripId)?.performReject()
    }

    // Called once the trip itself completes (DriverDashboard.js's
    // completeTrip()) — the only thing that ever destroys an answered
    // call's Connection, since performAnswer() deliberately leaves it
    // ACTIVE rather than destroying it immediately.
    AsyncFunction("endCall") { tripId: String ->
      TripCallBridge.getConnection(tripId)?.performEnd()
    }

    // Cold-start fallback — when the app was fully killed,
    // TripConnectionService.launchIncomingCallActivity() starts a fresh
    // process with the trip data on the launching Intent's extras (the
    // onIncomingCall *event* only reaches a JS bridge that's already
    // alive, which a brand new process isn't yet). App.js reads this once
    // at startup, same "read once at launch" shape as
    // notifee.getInitialNotification().
    AsyncFunction("getLaunchCallDataAsync") {
      val intent = appContext.currentActivity?.intent
      val extras = intent?.extras
      if (extras == null || !extras.getBoolean("tripCallIncoming", false)) {
        return@AsyncFunction null
      }
      val result = mutableMapOf<String, String>()
      for (key in extras.keySet()) {
        if (key == "tripCallIncoming") continue
        val value = extras.getString(key)
        if (value != null) result[key] = value
      }
      result
    }
  }

  override fun onIncomingCall(data: Bundle) {
    val map = mutableMapOf<String, String>()
    for (key in data.keySet()) {
      val value = data.getString(key)
      if (value != null) map[key] = value
    }
    sendEvent("onIncomingCall", mapOf("data" to map))
  }

  override fun onCallEnded(reason: String) {
    sendEvent("onCallEnded", mapOf("reason" to reason))
  }
}

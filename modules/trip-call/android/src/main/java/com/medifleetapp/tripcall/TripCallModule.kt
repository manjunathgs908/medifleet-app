package com.medifleetapp.tripcall

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
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
    AsyncFunction("startIncomingCall") { data: Map<String, String> ->
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

      telecomManager.addNewIncomingCall(phoneAccountHandle, extras)
    }

    AsyncFunction("answerCall") {
      TripCallBridge.currentConnection?.performAnswer()
    }

    AsyncFunction("rejectCall") {
      TripCallBridge.currentConnection?.performReject()
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

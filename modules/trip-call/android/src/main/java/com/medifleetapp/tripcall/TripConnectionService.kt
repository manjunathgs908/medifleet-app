package com.medifleetapp.tripcall

import android.content.Intent
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log

private const val TAG = "TripConnectionService"

/**
 * System-bound (android:permission="android.permission.BIND_TELECOM_CONNECTION_SERVICE")
 * — the Telecom framework instantiates and calls into this, not our own
 * app code directly. Runs in-process (self-managed ConnectionServices are
 * not a separate process), so it can reach TripCallBridge and start
 * MainActivity directly.
 *
 * onCreateIncomingConnection only runs as a result of OUR OWN prior call to
 * TelecomManager.addNewIncomingCall(...) (see TripCallModule.startIncomingCall) —
 * there is no other caller of this PhoneAccount — so by the time this fires,
 * the JS bridge that made that call is already alive (foreground, or the
 * expo-task-manager headless task that received the FCM message). That's
 * what makes emitting straight to JS here reliable rather than a cold-start
 * guess.
 */
class TripConnectionService : ConnectionService() {

  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccountHandle: PhoneAccountHandle?,
    request: ConnectionRequest?
  ): Connection {
    // TripCallModule.startIncomingCall() sends our trip payload both as
    // top-level extras AND wrapped in TelecomManager.EXTRA_INCOMING_CALL_EXTRAS
    // (the documented mechanism for a ConnectionService's own custom
    // per-call data) — checking the wrapped form first, falling back to
    // top-level, since which one Android actually surfaces here isn't
    // something verifiable without a real device build.
    val rawExtras = request?.extras ?: Bundle()
    val extras = rawExtras.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS) ?: rawExtras

    val connection = TripConnection(applicationContext, extras)
    TripCallBridge.currentConnection = connection

    launchIncomingCallActivity(extras)
    TripCallBridge.emitIncomingCall(extras)
    connection.startRinging()

    return connection
  }

  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccountHandle: PhoneAccountHandle?,
    request: ConnectionRequest?
  ) {
    Log.e(TAG, "onCreateIncomingConnectionFailed — Telecom framework rejected the incoming call request.")
  }

  private fun launchIncomingCallActivity(extras: Bundle) {
    try {
      val packageName = applicationContext.packageName
      val launchIntent = applicationContext.packageManager.getLaunchIntentForPackage(packageName)
      if (launchIntent == null) {
        Log.e(TAG, "Could not resolve this app's own launch intent — cannot open incoming-call UI.")
        return
      }
      launchIntent.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
      )
      launchIntent.putExtra("tripCallIncoming", true)
      launchIntent.putExtras(extras)
      applicationContext.startActivity(launchIntent)
    } catch (e: Exception) {
      // The onIncomingCall JS event (emitted regardless, right after this
      // call) is the primary UI trigger when the app is already running;
      // this direct startActivity is what reliably wakes/opens the app
      // when it's backgrounded or killed. If it fails, the driver still
      // has the ringing call itself (audible) and, if notify-kit's
      // full-screen notification path also ran, that as a second route in.
      Log.e(TAG, "Could not launch incoming-call activity: ${e.message}")
    }
  }
}

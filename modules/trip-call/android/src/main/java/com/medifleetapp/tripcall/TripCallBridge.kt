package com.medifleetapp.tripcall

import android.os.Bundle
import java.util.concurrent.ConcurrentHashMap

/**
 * Shared singleton connecting the non-Module native classes (TripConnection,
 * TripConnectionService — plain android.telecom.* subclasses, not Expo
 * Modules, so they have no direct way to call sendEvent) to whichever
 * TripCallModule instance is currently alive. Same shape as
 * expo-notifications' own NotificationManager-singleton-plus-listener
 * pattern (NotificationsEmitter.kt), which this was modeled on directly.
 *
 * Connections are tracked in a Map keyed by tripId rather than a single
 * mutable reference. A single `var currentConnection` meant answerCall()/
 * rejectCall() from JS always acted on whichever connection was *most
 * recently created* — confirmed on a real device: when a second connection
 * existed (duplicate FCM delivery, or a prior call never destroyed), tapping
 * Accept silently answered the wrong one while the one on screen kept
 * ringing. Answered calls are deliberately NOT removed from this map — they
 * stay reachable by tripId so TripCallModule.endCall() can destroy them
 * later when the trip actually completes (see TripConnection.performEnd()).
 */
interface TripCallListener {
  fun onIncomingCall(data: Bundle)
  fun onCallEnded(tripId: String?, reason: String)
}

object TripCallBridge {
  private val connections = mutableMapOf<String, TripConnection>()

  private var listener: TripCallListener? = null

  fun setListener(l: TripCallListener?) {
    listener = l
  }

  fun registerConnection(tripId: String, connection: TripConnection) {
    connections[tripId] = connection
  }

  fun unregisterConnection(tripId: String) {
    connections.remove(tripId)
  }

  fun getConnection(tripId: String): TripConnection? = connections[tripId]

  fun emitIncomingCall(data: Bundle) {
    listener?.onIncomingCall(data)
  }

  // tripId travels with the event now — see the double IncomingTripScreen
  // fix in App.js/IncomingTripScreen.js: onCallEnded previously carried
  // only a bare reason, so any mounted screen reacted to ANY call ending
  // anywhere (e.g. a different, stacked call's timeout could dismiss the
  // wrong screen).
  fun emitCallEnded(tripId: String?, reason: String) {
    listener?.onCallEnded(tripId, reason)
  }

  // Native-only handshake between TripCallModule.startIncomingCall (the
  // JS-facing AsyncFunction) and TripConnectionService's
  // onCreateIncomingConnection/onCreateIncomingConnectionFailed --
  // deliberately never crosses the JS bridge, so it works correctly
  // regardless of whether startIncomingCall was invoked from the main
  // app's bridge or a headless background-task bridge (see
  // TripCallModule.getLaunchCallDataAsync's comment on why onIncomingCall
  // itself can't be trusted to reach a not-yet-alive bridge).
  //
  // ConcurrentHashMap, not mutableMapOf — awaitConnectionOutcome runs on
  // whatever coroutine dispatcher AsyncFunction uses, while
  // resolveConnectionOutcome runs on Telecom's own callback thread; two
  // overlapping bookings (different tripIds) hitting this concurrently
  // must not corrupt the map. Keyed by tripId like `connections` above,
  // so two different tripIds already can't clobber or resolve each
  // other's callback -- only the thread-safety of concurrent access
  // needed the fix.
  private val pendingOutcomes = ConcurrentHashMap<String, (Boolean) -> Unit>()

  fun awaitConnectionOutcome(tripId: String, callback: (Boolean) -> Unit) {
    pendingOutcomes[tripId] = callback
  }

  // Safe no-op if tripId was never awaited (e.g. a stray callback, or one
  // that already resolved/timed out) -- remove() returns null for an
  // absent key, and the safe call below simply skips invoking anything.
  fun resolveConnectionOutcome(tripId: String, success: Boolean) {
    pendingOutcomes.remove(tripId)?.invoke(success)
  }
}

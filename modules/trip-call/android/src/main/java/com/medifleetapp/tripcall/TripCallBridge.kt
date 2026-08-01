package com.medifleetapp.tripcall

import android.os.Bundle

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
  fun onCallEnded(reason: String)
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

  fun emitCallEnded(reason: String) {
    listener?.onCallEnded(reason)
  }
}

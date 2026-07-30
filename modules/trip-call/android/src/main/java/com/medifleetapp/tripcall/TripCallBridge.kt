package com.medifleetapp.tripcall

import android.os.Bundle

/**
 * Shared singleton connecting the non-Module native classes (TripConnection,
 * TripConnectionService — plain android.telecom.* subclasses, not Expo
 * Modules, so they have no direct way to call sendEvent) to whichever
 * TripCallModule instance is currently alive. Same shape as
 * expo-notifications' own NotificationManager-singleton-plus-listener
 * pattern (NotificationsEmitter.kt), which this was modeled on directly.
 */
interface TripCallListener {
  fun onIncomingCall(data: Bundle)
  fun onCallEnded(reason: String)
}

object TripCallBridge {
  var currentConnection: TripConnection? = null

  private var listener: TripCallListener? = null

  fun setListener(l: TripCallListener?) {
    listener = l
  }

  fun emitIncomingCall(data: Bundle) {
    listener?.onIncomingCall(data)
  }

  fun emitCallEnded(reason: String) {
    listener?.onCallEnded(reason)
  }
}

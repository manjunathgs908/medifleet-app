package com.medifleetapp.tripcall

import android.content.Context
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.telecom.Connection
import android.telecom.DisconnectCause
import android.util.Log

private const val TAG = "TripConnection"
private const val RING_TIMEOUT_MS = 30_000L

/**
 * Represents one in-flight incoming trip "call". Ringtone/vibration and the
 * 30s no-answer timeout are handled natively here — independent of JS —
 * so they keep running even if the JS bundle is momentarily slow to load
 * or render (the whole point of using the Telecom framework rather than a
 * plain notification: this class's lifecycle is owned by Android's
 * telecom stack, not by our own JS/Activity lifecycle).
 *
 * onAnswer()/onReject() are Android's own callbacks — invoked when
 * something OTHER than our in-app buttons answers/rejects the call (a
 * Bluetooth headset button, Android Auto, a wearable). The in-app Accept/
 * Reject buttons call TripCallModule.answerCall()/rejectCall(), which call
 * performAnswer()/performReject() directly — both paths converge on the
 * same two methods so native call state and the in-app UI can never
 * disagree about whether the call is still ringing.
 *
 * Uses explicit Java-style setter/method calls throughout (setX(...))
 * rather than Kotlin property syntax for android.telecom.Connection's
 * members — deliberate, to avoid any ambiguity about which members Kotlin
 * would expose as properties vs. plain methods, since this module can't be
 * compile-verified in this environment before a real device build.
 */
class TripConnection(
  private val context: Context,
  val tripData: Bundle,
) : Connection() {

  // Identifies this connection in TripCallBridge's map — every payload
  // this module ever receives is required to have a tripId (see
  // index.js's handleTripCallMessage, which returns early without one).
  val tripId: String? = tripData.getString("tripId")

  private val mainHandler = Handler(Looper.getMainLooper())
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private var ended = false

  private val timeoutRunnable = Runnable {
    Log.i(TAG, "No answer within ${RING_TIMEOUT_MS}ms — treating as missed.")
    endCall(DisconnectCause(DisconnectCause.MISSED), "timeout")
  }

  init {
    setConnectionProperties(Connection.PROPERTY_SELF_MANAGED)
    setAudioModeIsVoip(true)
  }

  fun startRinging() {
    setRinging()
    startRingtoneAndVibration()
    mainHandler.postDelayed(timeoutRunnable, RING_TIMEOUT_MS)
  }

  // ── Android-initiated (Bluetooth/Auto/wearable) ──────────────────────
  override fun onAnswer() {
    performAnswer()
  }

  override fun onReject() {
    performReject()
  }

  override fun onDisconnect() {
    endCall(DisconnectCause(DisconnectCause.LOCAL), "disconnected")
  }

  // ── App-initiated (in-app Accept/Reject buttons, via TripCallModule) ─
  fun performAnswer() {
    if (ended) return
    mainHandler.removeCallbacks(timeoutRunnable)
    stopRingtoneAndVibration()
    setActive()
    TripCallBridge.emitCallEnded(tripId, "answered")
    // Deliberately NOT calling endCall()/destroy() here — an active call
    // stays reachable (by tripId, in TripCallBridge's map) until the trip
    // itself completes; TripCallModule.endCall(tripId) is what destroys it
    // then (wired into DriverDashboard.js's completeTrip()).
  }

  fun performReject() {
    if (ended) return
    endCall(DisconnectCause(DisconnectCause.REJECTED), "rejected")
  }

  // Called from TripCallModule.endCall(tripId) once the trip completes —
  // the only way an answered/ACTIVE call ever gets destroyed, since
  // performAnswer() deliberately leaves it alive.
  fun performEnd() {
    endCall(DisconnectCause(DisconnectCause.LOCAL), "ended")
  }

  private fun endCall(cause: DisconnectCause, reason: String) {
    if (ended) return
    ended = true
    mainHandler.removeCallbacks(timeoutRunnable)
    stopRingtoneAndVibration()
    setDisconnected(cause)
    destroy()
    TripCallBridge.emitCallEnded(tripId, reason)
    tripId?.let { TripCallBridge.unregisterConnection(it) }
  }

  // ── Ringtone + vibration ──────────────────────────────────────────────
  private fun startRingtoneAndVibration() {
    try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      val ringerMode = audioManager?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL

      if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
        val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val tone = RingtoneManager.getRingtone(context, uri)
        if (tone != null) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            tone.setLooping(true)
          }
          tone.play()
          ringtone = tone
        }
      }

      if (ringerMode != AudioManager.RINGER_MODE_SILENT) {
        val pattern = longArrayOf(0, 800, 400, 800, 400)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          val vibratorManager =
            context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
          vibrator = vibratorManager?.defaultVibrator
        } else {
          @Suppress("DEPRECATION")
          vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 1))
        } else {
          @Suppress("DEPRECATION")
          vibrator?.vibrate(pattern, 1)
        }
      }
    } catch (e: Exception) {
      // Ringtone/vibration failing must never prevent the call itself
      // from ringing/being answerable — the visible UI is what matters
      // most; sound/vibration are an enhancement on top of it.
      Log.w(TAG, "Could not start ringtone/vibration: ${e.message}")
    }
  }

  private fun stopRingtoneAndVibration() {
    try {
      ringtone?.stop()
    } catch (e: Exception) {
      Log.w(TAG, "Could not stop ringtone: ${e.message}")
    }
    ringtone = null
    try {
      vibrator?.cancel()
    } catch (e: Exception) {
      Log.w(TAG, "Could not cancel vibration: ${e.message}")
    }
    vibrator = null
  }
}

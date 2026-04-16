/**
 * Module-level pub/sub event bus for real-time check-in sync.
 * In TEST_MODE this replaces Firebase's onSnapshot pattern.
 * The same subscribe/unsubscribe API is used whether we're in test mode
 * or using Firebase, so callers don't need to know which backend is active.
 *
 * Cross-tab sync: BroadcastChannel is used so that events emitted in one
 * browser tab (e.g. the admin dashboard opening a session) are delivered to
 * listeners in other tabs (e.g. kiosk tabs). Falls back gracefully in
 * environments where BroadcastChannel is unavailable (jsdom, older browsers).
 */

export type CheckinEventType =
  | 'checkin_created'
  | 'checkin_updated'
  | 'session_created'
  | 'session_updated'
  | 'pickup_queue_updated'

export interface CheckinEvent {
  type: CheckinEventType
  payload: Record<string, unknown>
  timestamp: string
}

type Listener = (event: CheckinEvent) => void

const CHANNEL_NAME = 'gather-checkin'

class CheckinEventBus {
  private listeners: Set<Listener> = new Set()
  private channel: BroadcastChannel | null = null

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      // Deliver events from other tabs to local listeners
      this.channel.onmessage = (e: MessageEvent<CheckinEvent>) => {
        this.listeners.forEach(l => l(e.data))
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(event: CheckinEvent): void {
    // Deliver to same-tab listeners
    this.listeners.forEach(l => l(event))
    // Broadcast to other tabs
    this.channel?.postMessage(event)
  }

  emit(type: CheckinEventType, payload: Record<string, unknown>): void {
    this.publish({ type, payload, timestamp: new Date().toISOString() })
  }
}

// Singleton — same instance for the entire app
export const checkinBus = new CheckinEventBus()

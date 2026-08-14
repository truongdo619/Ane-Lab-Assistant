import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useSpeechOutputControlStore } from './speech-output-control'

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('speech output control store', () => {
  beforeEach(() => {
    const localStorage = new MemoryStorage()
    vi.stubGlobal('Storage', MemoryStorage)
    vi.stubGlobal('StorageEvent', class {
      constructor(
        readonly type: string,
        readonly init: StorageEventInit,
      ) {}
    })
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
      localStorage,
      removeEventListener: vi.fn(),
    })
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records manual chat stop-speaking requests with monotonic sequence numbers', () => {
    const store = useSpeechOutputControlStore()

    expect(store.latestStopRequest).toBeUndefined()

    store.requestStopSpeaking('manual-chat')

    expect(store.latestStopRequest).toEqual({
      id: 1,
      reason: 'manual-chat',
    })

    store.requestStopSpeaking('manual-chat')

    expect(store.latestStopRequest).toEqual({
      id: 2,
      reason: 'manual-chat',
    })
  })

  it('records manual-all stop requests with monotonic sequence numbers', () => {
    const store = useSpeechOutputControlStore()

    store.requestStopSpeaking('manual-all')

    expect(store.latestStopRequest).toEqual({
      id: 1,
      reason: 'manual-all',
    })
  })

  it('persists mute state and requests an immediate stop when mute is enabled', async () => {
    const store = useSpeechOutputControlStore()

    expect(store.speechMuted).toBe(false)

    store.setSpeechMuted(true)

    expect(store.speechMuted).toBe(true)
    expect(store.latestStopRequest).toEqual({
      id: 1,
      reason: 'muted',
    })

    await nextTick()
    setActivePinia(createPinia())
    const restoredStore = useSpeechOutputControlStore()

    expect(restoredStore.speechMuted).toBe(true)
  })

  it('does not publish another stop request when speech output is unmuted', () => {
    const store = useSpeechOutputControlStore()
    store.setSpeechMuted(true)

    store.setSpeechMuted(false)

    expect(store.speechMuted).toBe(false)
    expect(store.latestStopRequest).toEqual({
      id: 1,
      reason: 'muted',
    })
  })
})

describe('assistant audibility tracking', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ROOT CAUSE:
  //
  // With speakers instead of headphones, the microphone captured the assistant's
  // own TTS output. Web Speech transcribed it, auto-send delivered it as the
  // user's next message, and the character answered itself in a loop.
  //
  // Nothing in the hearing path knew playback was happening — there was no
  // `isSpeaking` signal anywhere — and browser `echoCancellation` does not help,
  // because it assumes playback and capture share one device.
  //
  // We fixed this by counting active playback in this store and having the
  // transcription callbacks drop transcripts while the assistant is audible.
  it('reports audible while a segment is playing', () => {
    const store = useSpeechOutputControlStore()

    expect(store.isAssistantAudible()).toBe(false)

    store.beginAssistantPlayback()

    expect(store.isAssistantAudible()).toBe(true)
  })

  it('stays audible until the last overlapping segment ends', () => {
    const store = useSpeechOutputControlStore()

    store.beginAssistantPlayback()
    store.beginAssistantPlayback()
    store.endAssistantPlayback()

    expect(store.isAssistantAudible()).toBe(true)
  })

  it('keeps suppressing briefly after playback stops, then releases', () => {
    const store = useSpeechOutputControlStore()

    store.beginAssistantPlayback()
    store.endAssistantPlayback()

    // Speaker audio reaches the microphone after the playback node reports it
    // finished, so the tail window must still suppress.
    vi.advanceTimersByTime(100)
    expect(store.isAssistantAudible()).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(store.isAssistantAudible()).toBe(false)
  })

  it('does not latch suppression on unbalanced end events', () => {
    const store = useSpeechOutputControlStore()

    // Interrupt and reject can arrive without a matching start.
    store.endAssistantPlayback()
    store.endAssistantPlayback()
    vi.advanceTimersByTime(1000)

    store.beginAssistantPlayback()
    store.endAssistantPlayback()
    vi.advanceTimersByTime(1000)

    expect(store.isAssistantAudible()).toBe(false)
  })
})

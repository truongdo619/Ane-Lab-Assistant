import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useProviderConfigStore } from './config'
import { useProviderStore } from './provider'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('provider store synchronization boundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ROOT CAUSE:
  //
  // Provider actions, serializable runtime data, and computedAsync output
  // shared one synced store. Applying the derived ref in every Electron
  // renderer restarted its local async computation, which proposed another
  // snapshot and starved the main window's event loop.
  //
  // We fixed this by keeping executable actions in the provider store and
  // placing the replicated data in an internal state-only store.
  it('keeps replicated runtime data out of the executable provider store state', () => {
    const store = useProviderStore()
    const runtimeState = {
      models: [],
      modelStatus: 'ready' as const,
      modelError: null,
    }

    store.providerRuntimeState.openai = runtimeState

    expect(store.$state).not.toHaveProperty('providerRuntimeState')
    expect(store.$state).not.toHaveProperty('providerAvailabilityOverrides')
    expect(store.providerRuntimeState.openai).toEqual(runtimeState)
  })

  // ROOT CAUSE:
  //
  // A model request kept a reference to its runtime entry across an await.
  // A synced snapshot replaced that entry before the request completed. The
  // request then wrote ready to the detached entry and left the current entry
  // in loading state.
  it('updates the current runtime entry after a synced snapshot replaces it', async () => {
    const store = useProviderStore()
    const request = store.fetchModelsForProvider('official-provider')

    expect(store.providerRuntimeState['official-provider']?.modelStatus).toBe('loading')

    store.providerRuntimeState['official-provider'] = {
      models: [],
      modelStatus: 'loading',
      modelError: null,
    }

    await request

    expect(store.providerRuntimeState['official-provider']?.modelStatus).toBe('ready')
    expect(store.providerRuntimeState['official-provider']?.modelError).toBeNull()
    expect(store.providerRuntimeState['official-provider']?.models).toEqual([
      expect.objectContaining({ id: 'auto' }),
    ])
  })
})

describe('initializeProvider configuration status', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ROOT CAUSE:
  //
  // Modules -> Hearing reported "No Providers Configured" even though the Web
  // Speech settings page transcribed successfully. The module pickers list
  // providers whose status is `configured`, `ensureProvider` stores new
  // providers as `unconfigured`, and the only promotion path was
  // `updateConfigurationStatus`, which skips providers without in-memory
  // runtime state:
  //
  //   if (providerRuntimeState.value[providerId]) {
  //     providerConfigStore.setProviderStatus(providerId, isValid ? 'configured' : 'invalid')
  //   }
  //
  // Runtime state does not survive a reload, so a provider requiring neither
  // credentials nor validation could stay `unconfigured` permanently, with
  // editing localStorage the only way out.
  //
  // We fixed this by promoting such providers during `initializeProvider`,
  // since a definition declaring `requiresCredentials: false` and no required
  // validation has nothing left to check.
  it('marks a credential-free provider configured so module pickers list it', () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()

    store.initializeProvider('browser-web-speech-api')

    expect(configStore.configuredProviders['browser-web-speech-api']).toBe(true)
  })

  it('leaves a provider that needs credentials unconfigured', () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()

    store.initializeProvider('openai')

    expect(configStore.configuredProviders.openai).toBe(false)
  })
})

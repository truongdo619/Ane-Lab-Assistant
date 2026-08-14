import { describe, expect, it } from 'vitest'

import { providerOllama, resolveOllamaReasoningEffort, resolveOllamaThink } from './index'

describe('providerOllama.resolveOllamaThink', () => {
  it('should return undefined for auto mode', () => {
    expect(resolveOllamaThink('qwen3:8b', 'auto')).toBeUndefined()
  })

  it('should map disable/enable to booleans for non gpt-oss models', () => {
    expect(resolveOllamaThink('qwen3:8b', 'disable')).toBe(false)
    expect(resolveOllamaThink('qwen3:8b', 'enable')).toBe(true)
  })

  it('should map disable/enable to levels for gpt-oss models', () => {
    expect(resolveOllamaThink('gpt-oss:20b', 'disable')).toBe('low')
    expect(resolveOllamaThink('gpt-oss:20b', 'enable')).toBe('medium')
  })

  it('should pass level modes through unchanged', () => {
    expect(resolveOllamaThink('qwen3:8b', 'low')).toBe('low')
    expect(resolveOllamaThink('qwen3:8b', 'medium')).toBe('medium')
    expect(resolveOllamaThink('qwen3:8b', 'high')).toBe('high')
  })

  it('should fallback invalid values to auto mode', () => {
    expect(resolveOllamaThink('qwen3:8b', 'invalid')).toBeUndefined()
  })
})

describe('providerOllama.createProvider chat options', () => {
  it('should not set think when thinkingMode is auto', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'auto',
    }) as any

    const chatOptions = provider.chat('qwen3:8b') as Record<string, unknown>
    expect('think' in chatOptions).toBe(false)
  })

  it('should set think=false for non gpt-oss when thinkingMode is disable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    }) as any

    const chatOptions = provider.chat('qwen3:8b') as Record<string, unknown>
    expect(chatOptions.think).toBe(false)
  })

  it('should set think=medium for gpt-oss when thinkingMode is enable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'enable',
    }) as any

    const chatOptions = provider.chat('gpt-oss:20b') as Record<string, unknown>
    expect(chatOptions.think).toBe('medium')
  })

  it('should set think=low for gpt-oss when thinkingMode is disable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    }) as any

    const chatOptions = provider.chat('gpt-oss:20b') as Record<string, unknown>
    expect(chatOptions.think).toBe('low')
  })
})

describe('providerOllama.resolveOllamaReasoningEffort', () => {
  it('should suppress reasoning only when thinkingMode is disable', () => {
    expect(resolveOllamaReasoningEffort('qwen3.5:4b', 'disable')).toBe('none')
    expect(resolveOllamaReasoningEffort('qwen3.5:4b', 'auto')).toBeUndefined()
    expect(resolveOllamaReasoningEffort('qwen3.5:4b', 'enable')).toBeUndefined()
  })

  it('should keep level modes out of the request', () => {
    expect(resolveOllamaReasoningEffort('qwen3.5:4b', 'low')).toBeUndefined()
    expect(resolveOllamaReasoningEffort('qwen3.5:4b', 'medium')).toBeUndefined()
    expect(resolveOllamaReasoningEffort('qwen3.5:4b', 'high')).toBeUndefined()
  })

  it('should degrade to low for gpt-oss, which cannot fully disable reasoning', () => {
    expect(resolveOllamaReasoningEffort('gpt-oss:20b', 'disable')).toBe('low')
  })

  it('should fallback invalid values to auto mode', () => {
    expect(resolveOllamaReasoningEffort('qwen3.5:4b', 'invalid')).toBeUndefined()
  })
})

describe('providerOllama.createProvider reasoning suppression', () => {
  // ROOT CAUSE:
  //
  // Selecting "disable" thinking mode left thinking models reasoning anyway, and
  // the chat bubble stayed empty for the whole reasoning phase because AIRI renders
  // `content` deltas but not `reasoning` deltas.
  // This happens because `chat()` only attached Ollama's native `think` field:
  //
  //   return { ...chatOptions, think }
  //
  // `think` is an /api/chat field. This provider is configured against the
  // OpenAI-compatible /v1/chat/completions route, which drops unknown fields and
  // honours `reasoning_effort` instead. Measured on Ollama 0.32.9 + qwen3.5:4b,
  // `think: false` still emitted 1115 reasoning characters and pushed the first
  // visible token past 50s.
  //
  // We fixed this by also sending `reasoning_effort` whenever the mode asks for
  // suppression, which measured 0 reasoning characters and a 1.3s first token:
  //
  //   return { ...chatOptions, think, reasoning_effort: reasoningEffort }
  it('should send reasoning_effort=none alongside think when disabling', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    }) as any

    const chatOptions = provider.chat('qwen3.5:4b') as Record<string, unknown>
    expect(chatOptions.think).toBe(false)
    expect(chatOptions.reasoning_effort).toBe('none')
  })

  it('should send reasoning_effort=low for gpt-oss when disabling', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    }) as any

    const chatOptions = provider.chat('gpt-oss:20b') as Record<string, unknown>
    expect(chatOptions.reasoning_effort).toBe('low')
  })

  it('should not send reasoning_effort when thinking is not being disabled', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'enable',
    }) as any

    const chatOptions = provider.chat('qwen3.5:4b') as Record<string, unknown>
    expect('reasoning_effort' in chatOptions).toBe(false)
  })

  it('should leave the request untouched in auto mode', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'auto',
    }) as any

    const chatOptions = provider.chat('qwen3.5:4b') as Record<string, unknown>
    expect('think' in chatOptions).toBe(false)
    expect('reasoning_effort' in chatOptions).toBe(false)
  })
})

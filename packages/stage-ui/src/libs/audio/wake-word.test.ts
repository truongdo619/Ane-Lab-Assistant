import { describe, expect, it } from 'vitest'

import { matchWakeWord, normalizeWakeText, parseWakePhrases } from './wake-word'

describe('normalizeWakeText', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeWakeText('  Hey,   Ane! ')).toBe('hey ane')
  })
})

describe('parseWakePhrases', () => {
  it('splits on commas and drops empty entries', () => {
    expect(parseWakePhrases('hey ane, Hey Annie,, ')).toEqual(['hey ane', 'hey annie'])
  })
})

describe('matchWakeWord', () => {
  const phrases = parseWakePhrases('hey ane, hey annie')

  it('matches the phrase with a command and returns the remainder', () => {
    expect(matchWakeWord('Hey Ane, what time is it?', phrases))
      .toEqual({ matched: true, remainder: 'what time is it' })
  })

  it('matches the phrase standing alone with an empty remainder', () => {
    expect(matchWakeWord('hey ane', phrases))
      .toEqual({ matched: true, remainder: '' })
  })

  it('accepts any listed variant, since recognisers respell invented names', () => {
    expect(matchWakeWord('Hey Annie, hello there', phrases).matched).toBe(true)
  })

  it('rejects a wake word buried mid-sentence', () => {
    expect(matchWakeWord('I told hey ane something', phrases).matched).toBe(false)
  })

  it('rejects a longer word that merely starts with the phrase', () => {
    expect(matchWakeWord('hey anecdote lovers', phrases).matched).toBe(false)
  })

  it('rejects unrelated speech', () => {
    expect(matchWakeWord('what time is it', phrases).matched).toBe(false)
  })
})

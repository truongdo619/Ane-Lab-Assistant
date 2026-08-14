/**
 * Transcript-level wake word matching.
 *
 * This gates what a transcript is allowed to trigger, not what the microphone
 * hears: the recogniser runs continuously either way, and the wake word
 * decides whether an utterance is treated as addressed to the character.
 * Matching is fuzzy on purpose — speech recognition rarely spells an invented
 * name consistently ("Ane" arrives as "Anne", "Annie", "Ana"), so the accepted
 * phrases are a user-editable list rather than one exact string.
 */

/**
 * Normalizes a transcript or wake phrase for comparison.
 *
 * @example
 * normalizeWakeText('Hey, Ane!')
 * // => 'hey ane'
 */
export function normalizeWakeText(text: string): string {
  return text
    .toLowerCase()
    // Keep letters and digits from any script; punctuation never survives
    // recognition consistently enough to match on.
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parses the user-edited phrase list ("hey ane, hey annie") into normalized,
 * non-empty phrases.
 */
export function parseWakePhrases(raw: string): string[] {
  return raw
    .split(',')
    .map(phrase => normalizeWakeText(phrase))
    .filter(phrase => phrase.length > 0)
}

export interface WakeWordMatch {
  matched: boolean
  /** Transcript with the wake phrase removed; empty when the phrase stood alone. */
  remainder: string
}

/**
 * Matches a transcript against the accepted wake phrases.
 *
 * The phrase must appear at the start of the utterance — a wake word buried
 * mid-sentence is conversation about the character, not an address to it.
 *
 * @example
 * matchWakeWord('Hey Ane, what time is it?', ['hey ane'])
 * // => { matched: true, remainder: 'what time is it' }
 */
export function matchWakeWord(transcript: string, phrases: string[]): WakeWordMatch {
  const normalized = normalizeWakeText(transcript)

  for (const phrase of phrases) {
    if (normalized === phrase)
      return { matched: true, remainder: '' }

    if (normalized.startsWith(`${phrase} `))
      return { matched: true, remainder: normalized.slice(phrase.length).trim() }
  }

  return { matched: false, remainder: '' }
}

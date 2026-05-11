/**
 * Tuning constants for the hybrid (semantic + lexical) note search ranking.
 *
 * Kept in one place so the noise-floor heuristic and the lexical bonuses can
 * be tweaked without hunting through the route handler.
 */

/**
 * Absolute minimum cosine score a semantic hit must reach to survive the
 * noise filter. Embedding models routinely score ~0.3-0.5 between any two
 * random texts, so anything under this floor is treated as no signal.
 */
export const ABS_FLOOR: number = 0.3;

/**
 * Maximum gap (in cosine score units) a hit may trail the top result before
 * it gets pruned. Captures the "top hit + close runners-up" intuition while
 * dropping the long tail of weakly related matches.
 */
export const REL_GAP: number = 0.18;

/**
 * Bonus added to the score when the literal query string appears in the
 * note title. Capped at 1 by the caller so it can rescue a borderline
 * match but never invents relevance from nothing.
 */
export const LEX_TITLE_BONUS: number = 0.2;

/**
 * Bonus added when the literal query appears in any of the note's tags.
 * Smaller than the title bonus because tags are noisier signals.
 */
export const LEX_TAG_BONUS: number = 0.12;

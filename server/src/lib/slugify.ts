/**
 * Canonical slug helper shared by REST routes that derive ids from
 * user-supplied labels (folders, kinds, …).
 *
 * Lower-cases the input, strips diacritics via NFKD, collapses any run of
 * non-alphanumerics into a single dash, trims leading/trailing dashes, and
 * caps the length so the resulting id fits the relevant column.
 *
 * @param input - Free-form label provided by the user.
 * @param maxLength - Hard cap for the resulting slug (default 120).
 * @returns A slug matching `[a-z0-9][a-z0-9-]*` (or empty string when the
 *   input has no alphanumerics — callers must validate the result).
 */
export function slugify(input: string, maxLength = 120): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}

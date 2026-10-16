/** Missing rating is unknown, never a fabricated numeric rating. */
export function validDriverRating(driver: { rating?: unknown; ratingCount?: unknown }) {
  return (driver.rating == null ? driver.ratingCount === undefined || driver.ratingCount === 0
    : typeof driver.rating === 'number' && Number.isFinite(driver.rating) && driver.rating >= 0 && driver.rating <= 5) &&
    (driver.ratingCount === undefined || Number.isSafeInteger(driver.ratingCount) && (driver.ratingCount as number) >= 0);
}

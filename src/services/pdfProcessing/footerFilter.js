/**
 * Footer Filter Module (Client-Side)
 * Filters out headers and footers from PDF text using:
 * 1. Position-based pre-filtering (top 15%, bottom 20%)
 * 2. Repetition-based detection (text appearing on multiple pages)
 */

/**
 * Filter headers and footers from PDF page data
 * Uses position-based and repetition-based filtering
 * @param {Object} pageData - Page data with items, viewport, pageNum
 * @param {Map} textToPages - Map of normalized text to Set of page numbers
 * @param {Object} options - Configuration options
 * @param {number} options.minRepetitions - Minimum pages for repetition filter (default: 2)
 * @returns {Promise<Array>} Filtered array of text items
 */
export async function filterHeadersAndFooters(
  pageData,
  textToPages,
  options = {}
) {
  const {
    minRepetitions = 2
  } = options;

  const { items, viewport } = pageData;
  const headerThreshold = viewport.height * 0.15; // Top 15% of page
  const footerThreshold = viewport.height * 0.80; // Bottom 20% of page

  // Apply repetition-based filtering
  return items.filter(({ item, normalized, yPos }) => {
    const isInHeader = yPos <= headerThreshold;
    const isInFooter = yPos >= footerThreshold;
    const isInHeaderFooterRegion = isInHeader || isInFooter;

    if (!isInHeaderFooterRegion) {
      // Not in header/footer region, keep it
      return true;
    }

    // In header/footer region - check if it repeats across pages
    const pagesWithThisText = textToPages.get(normalized);
    const repetitionCount = pagesWithThisText ? pagesWithThisText.size : 0;

    // Filter if:
    // 1. Text appears on multiple pages (likely header/footer), OR
    // 2. Text is very short (1-3 chars) and in header/footer region (likely page numbers, dates)
    const isLikelyHeaderFooter = repetitionCount >= minRepetitions ||
                                 (normalized.length <= 3 && isInHeaderFooterRegion);

    return !isLikelyHeaderFooter;
  }).map(({ item }) => item); // Return just the original items
}

/**
 * Synchronous version for backward compatibility
 * @param {Object} pageData - Page data with items, viewport, pageNum
 * @param {Map} textToPages - Map of normalized text to Set of page numbers
 * @param {number} minRepetitions - Minimum pages for repetition filter (default: 2)
 * @returns {Array} Filtered array of text items
 */
export function filterHeadersAndFootersSync(pageData, textToPages, minRepetitions = 2) {
  const { items, viewport } = pageData;
  const headerThreshold = viewport.height * 0.15; // Top 15% of page
  const footerThreshold = viewport.height * 0.80; // Bottom 20% of page

  return items.filter(({ item, normalized, yPos }) => {
    const isInHeader = yPos <= headerThreshold;
    const isInFooter = yPos >= footerThreshold;
    const isInHeaderFooterRegion = isInHeader || isInFooter;

    if (!isInHeaderFooterRegion) {
      // Not in header/footer region, keep it
      return true;
    }

    // In header/footer region - check if it repeats across pages
    const pagesWithThisText = textToPages.get(normalized);
    const repetitionCount = pagesWithThisText ? pagesWithThisText.size : 0;

    // Filter if:
    // 1. Text appears on multiple pages (likely header/footer), OR
    // 2. Text is very short (1-3 chars) and in header/footer region (likely page numbers, dates)
    const isLikelyHeaderFooter = repetitionCount >= minRepetitions ||
                                 (normalized.length <= 3 && isInHeaderFooterRegion);

    return !isLikelyHeaderFooter;
  }).map(({ item }) => item); // Return just the original items
}


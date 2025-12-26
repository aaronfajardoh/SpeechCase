/**
 * Footer Filter Module (Client-Side)
 * Filters out headers and footers from PDF text using:
 * 1. Position-based pre-filtering (top 15%, bottom 20%)
 * 2. Repetition-based detection (text appearing on multiple pages)
 */

// Helper function to check if text is a common word that shouldn't be filtered
// Common words (articles, prepositions, common verbs) are part of normal content
// and shouldn't be filtered just because they're short or repeat across pages
function isCommonWord(normalizedText) {
  if (!normalizedText || normalizedText.length === 0) return false
  
  // Common Spanish words
  const spanishCommonWords = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre',
    'es', 'son', 'está', 'están', 'ser', 'estar', 'tener', 'haber',
    'y', 'o', 'pero', 'mas', 'más', 'muy', 'también', 'como', 'cuando',
    'se', 'le', 'les', 'lo', 'que', 'quien', 'cual', 'donde', 'cuando',
    'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nuestro', 'nuestros'
  ])
  
  // Common English words
  const englishCommonWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
    'and', 'or', 'but', 'if', 'when', 'where', 'what', 'who', 'why', 'how',
    'this', 'that', 'these', 'those', 'he', 'she', 'it', 'they', 'we', 'you',
    'his', 'her', 'its', 'their', 'my', 'your', 'our', 'has', 'have', 'had'
  ])
  
  const trimmed = normalizedText.trim().toLowerCase()
  return spanishCommonWords.has(trimmed) || englishCommonWords.has(trimmed)
}

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

    // Extract normalized text from composite key (format: "text|length")
    let normalizedTextOnly = normalized;
    let normalizedLength = normalized.length;
    if (normalized.includes('|')) {
      normalizedTextOnly = normalized.split('|')[0];
      normalizedLength = normalizedTextOnly.length;
    }

    // Check if this is a common word that shouldn't be filtered
    const isCommon = isCommonWord(normalizedTextOnly);

    // Filter if:
    // 1. Text appears on multiple pages (likely header/footer) AND it's NOT a common word, OR
    // 2. Text is very short (1-3 chars) and in header/footer region AND it's NOT a common word (likely page numbers, dates)
    // Common words are kept even if they repeat or are short, as they're part of normal content
    const isLikelyHeaderFooter = (repetitionCount >= minRepetitions && !isCommon) ||
                                 (normalizedLength <= 3 && isInHeaderFooterRegion && !isCommon);

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

    // Extract normalized text from composite key (format: "text|length")
    let normalizedTextOnly = normalized;
    let normalizedLength = normalized.length;
    if (normalized.includes('|')) {
      normalizedTextOnly = normalized.split('|')[0];
      normalizedLength = normalizedTextOnly.length;
    }

    // Check if this is a common word that shouldn't be filtered
    const isCommon = isCommonWord(normalizedTextOnly);

    // Filter if:
    // 1. Text appears on multiple pages (likely header/footer) AND it's NOT a common word, OR
    // 2. Text is very short (1-3 chars) and in header/footer region AND it's NOT a common word (likely page numbers, dates)
    // Common words are kept even if they repeat or are short, as they're part of normal content
    const isLikelyHeaderFooter = (repetitionCount >= minRepetitions && !isCommon) ||
                                 (normalizedLength <= 3 && isInHeaderFooterRegion && !isCommon);

    return !isLikelyHeaderFooter;
  }).map(({ item }) => item); // Return just the original items
}


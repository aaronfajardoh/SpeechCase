/**
 * Footer Filter Module (Client-Side)
 * Filters out headers and footers from PDF text using:
 * 1. Position-based pre-filtering (top 15%, bottom 20%)
 * 2. Repetition-based detection (text appearing on multiple pages)
 * 3. DeepSeek LLM classification for footer-like content (citations, footnotes, etc.)
 */

/**
 * Classify whether candidate text is footer-like using DeepSeek LLM via API
 * @param {string} candidateText - The text block to classify
 * @param {string} surroundingContext - Context from the page (nearby text)
 * @param {string} apiUrl - API endpoint URL (default: '/api/pdf/classify-footer')
 * @returns {Promise<boolean>} true if classified as footer, false otherwise
 */
async function classifyFooterWithLLM(candidateText, surroundingContext, apiUrl = '/api/pdf/classify-footer') {
  if (!candidateText || candidateText.trim().length === 0) {
    return false;
  }

  try {
    console.log(`[Footer Filter] Calling API for: "${candidateText.substring(0, 50)}..."`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        candidateText,
        surroundingContext
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Footer Filter] API response: isFooter=${result.isFooter}`);
    return result.isFooter === true;
  } catch (error) {
    // Fallback: on error, don't treat as footer (safety)
    console.warn('[Footer Filter] API error:', error.message);
    return false;
  }
}

/**
 * Build surrounding context from page items for LLM classification
 * @param {Array} items - Array of { item, normalized, yPos }
 * @param {number} candidateIndex - Index of the candidate item
 * @param {number} contextWindow - Number of items before/after to include
 * @returns {string} Context string
 */
function buildSurroundingContext(items, candidateIndex, contextWindow = 5) {
  const start = Math.max(0, candidateIndex - contextWindow);
  const end = Math.min(items.length, candidateIndex + contextWindow + 1);
  
  const contextItems = [];
  for (let i = start; i < end; i++) {
    if (i !== candidateIndex) {
      contextItems.push(items[i].item.str);
    }
  }
  
  return contextItems.join(' ').trim();
}

/**
 * Filter headers and footers from PDF page data
 * Uses position-based, repetition-based, and LLM-based classification
 * @param {Object} pageData - Page data with items, viewport, pageNum
 * @param {Map} textToPages - Map of normalized text to Set of page numbers
 * @param {Object} options - Configuration options
 * @param {number} options.minRepetitions - Minimum pages for repetition filter (default: 2)
 * @param {string} options.apiUrl - API URL for LLM classification (default: '/api/pdf/classify-footer')
 * @param {boolean} options.useLLMClassification - Enable LLM classification (default: true)
 * @returns {Promise<Array>} Filtered array of text items
 */
export async function filterHeadersAndFooters(
  pageData,
  textToPages,
  options = {}
) {
  const {
    minRepetitions = 2,
    apiUrl = '/api/pdf/classify-footer',
    useLLMClassification = true
  } = options;

  const { items, viewport } = pageData;
  const headerThreshold = viewport.height * 0.15; // Top 15% of page
  const footerThreshold = viewport.height * 0.80; // Bottom 20% of page (changed from 0.85)

  // First pass: apply repetition-based filtering
  const repetitionFiltered = items.map(({ item, normalized, yPos }, index) => {
    const isInHeader = yPos <= headerThreshold;
    const isInFooter = yPos >= footerThreshold;
    const isInHeaderFooterRegion = isInHeader || isInFooter;

    if (!isInHeaderFooterRegion) {
      // Not in header/footer region, keep it
      return { item, normalized, yPos, index, keep: true, needsLLMCheck: false };
    }

    // In header/footer region - check if it repeats across pages
    const pagesWithThisText = textToPages.get(normalized);
    const repetitionCount = pagesWithThisText ? pagesWithThisText.size : 0;

    // Filter if:
    // 1. Text appears on multiple pages (likely header/footer), OR
    // 2. Text is very short (1-3 chars) and in header/footer region (likely page numbers, dates)
    const isLikelyHeaderFooter = repetitionCount >= minRepetitions ||
                                 (normalized.length <= 3 && isInHeaderFooterRegion);

    // If already filtered by repetition, don't need LLM check
    // If in footer region and not filtered, mark for LLM check
    const needsLLMCheck = useLLMClassification && isInFooter && !isLikelyHeaderFooter;

    return {
      item,
      normalized,
      yPos,
      index,
      keep: !isLikelyHeaderFooter,
      needsLLMCheck
    };
  });

  const llmCandidateCount = repetitionFiltered.filter(c => c.needsLLMCheck).length;
  if (llmCandidateCount > 0) {
    console.log(`[Footer Filter] Page ${pageData.pageNum || 'unknown'}: ${repetitionFiltered.length} items, ${llmCandidateCount} need LLM check`);
  }

  // Second pass: LLM classification for footer candidates
  if (useLLMClassification) {
    const llmChecks = [];
    let candidateCount = 0;
    
    for (const candidate of repetitionFiltered) {
      if (candidate.needsLLMCheck && candidate.keep) {
        candidateCount++;
        const surroundingContext = buildSurroundingContext(items, candidate.index);
        const candidateText = candidate.item.str;
        
        console.log(`[Footer Filter] Checking candidate ${candidateCount}: "${candidateText.substring(0, 50)}..."`);
        
        llmChecks.push(
          classifyFooterWithLLM(candidateText, surroundingContext, apiUrl)
            .then(isFooter => {
              if (isFooter) {
                console.log(`[Footer Filter] ✓ Classified as footer: "${candidateText.substring(0, 50)}..."`);
                candidate.keep = false;
              } else {
                console.log(`[Footer Filter] ✗ Not a footer: "${candidateText.substring(0, 50)}..."`);
              }
            })
            .catch(error => {
              // On error, keep the item (safety fallback)
              console.warn('[Footer Filter] LLM classification error for item:', error.message);
            })
        );
      }
    }

    if (candidateCount > 0) {
      console.log(`[Footer Filter] Processing ${candidateCount} footer candidate(s) with LLM...`);
      // Wait for all LLM checks to complete
      await Promise.all(llmChecks);
      console.log(`[Footer Filter] Completed LLM classification for ${candidateCount} candidate(s)`);
    } else {
      console.log('[Footer Filter] No footer candidates found for LLM classification');
    }
  }

  // Return only items that should be kept
  return repetitionFiltered
    .filter(candidate => candidate.keep)
    .map(candidate => candidate.item);
}

/**
 * Synchronous version for backward compatibility (without LLM)
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


/**
 * Footer Filter Module
 * Filters out headers and footers from PDF text using:
 * 1. Position-based pre-filtering (top 15%, bottom 20%)
 * 2. Repetition-based detection (text appearing on multiple pages)
 * 3. DeepSeek LLM classification for footer-like content (citations, footnotes, etc.)
 */

/**
 * Classify whether candidate text is footer-like using DeepSeek LLM
 * Supports both server-side (direct client) and client-side (API call) usage
 * @param {string} candidateText - The text block to classify
 * @param {string} surroundingContext - Context from the page (nearby text)
 * @param {Object|string} deepSeekClientOrApiUrl - DeepSeek OpenAI client instance (server-side) or API URL (client-side)
 * @returns {Promise<boolean>} true if classified as footer, false otherwise
 */
async function classifyFooterWithLLM(candidateText, surroundingContext, deepSeekClientOrApiUrl) {
  if (!candidateText || candidateText.trim().length === 0) {
    return false;
  }

  // Client-side: use API endpoint
  if (typeof deepSeekClientOrApiUrl === 'string' || !deepSeekClientOrApiUrl) {
    const apiUrl = deepSeekClientOrApiUrl || '/api/pdf/classify-footer';
    try {
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
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      return result.isFooter === true;
    } catch (error) {
      // Fallback: on error, don't treat as footer (safety)
      console.warn('Footer classification API error:', error.message);
      return false;
    }
  }

  // Server-side: use client directly
  const deepSeekClient = deepSeekClientOrApiUrl;
  if (!deepSeekClient) {
    // Fallback: if no client, don't treat as footer (safety)
    return false;
  }

  const prompt = `You are analyzing text extracted from a PDF page. Some pages contain narrative text and may also contain footer text such as references, explanations, citations, or glossary-like clarifications.

The text below is a *candidate* block located near the bottom of a page. Determine whether it is **likely to be footer-like material** rather than part of the main narrative.  

Consider characteristics such as:
- It reads like a definition, citation, reference entry, or explanatory footnote  
- It does not continue naturally from the surrounding narrative  
- It feels self-contained or meta-textual  
- It looks like a caption, annotation, or academic explanation  
- It shifts tone compared to the surrounding text  
- It breaks the narrative flow  

Do NOT rely on formatting cues like capitalization or line breaks (the PDF text extraction removes formatting).  

Respond strictly with:  
"yes" → this looks like a footer  
"no"  → this looks like normal narrative text

---
Surrounding Context:
${surroundingContext || '(no context available)'}

Candidate Block:
${candidateText}`;

  try {
    const response = await deepSeekClient.chat.completions.create({
      model: deepSeekClient.baseURL?.includes('deepseek') ? 'deepseek-chat' : 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0,
      max_tokens: 10 // Just need "yes" or "no"
    });

    const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
    return answer === 'yes';
  } catch (error) {
    // Fallback: on error, don't treat as footer (safety)
    console.warn('DeepSeek footer classification error:', error.message);
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
 * @param {Object|string} options.deepSeekClientOrApiUrl - DeepSeek client (server-side) or API URL (client-side, default: '/api/pdf/classify-footer')
 * @param {boolean} options.useLLMClassification - Enable LLM classification (default: true if client/apiUrl provided)
 * @returns {Promise<Array>} Filtered array of text items
 */
export async function filterHeadersAndFooters(
  pageData,
  textToPages,
  options = {}
) {
  const {
    minRepetitions = 2,
    deepSeekClientOrApiUrl = null,
    useLLMClassification = !!deepSeekClientOrApiUrl
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

  // Second pass: LLM classification for footer candidates
  if (useLLMClassification && deepSeekClientOrApiUrl) {
    const llmChecks = [];
    
    for (const candidate of repetitionFiltered) {
      if (candidate.needsLLMCheck && candidate.keep) {
        const surroundingContext = buildSurroundingContext(items, candidate.index);
        llmChecks.push(
          classifyFooterWithLLM(candidate.item.str, surroundingContext, deepSeekClientOrApiUrl)
            .then(isFooter => {
              if (isFooter) {
                candidate.keep = false;
              }
            })
            .catch(error => {
              // On error, keep the item (safety fallback)
              console.warn('LLM classification error for item:', error.message);
            })
        );
      }
    }

    // Wait for all LLM checks to complete
    await Promise.all(llmChecks);
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


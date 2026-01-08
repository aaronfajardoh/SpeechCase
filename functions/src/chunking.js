/**
 * Intelligent text chunking service for PDF documents
 * Splits text into semantically meaningful chunks with overlap and metadata
 */

const {detectHeader} = require("./headerDetection");

/**
 * Chunks text into smaller pieces with overlap for better context preservation
 * @param {string} text - The text to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.chunkSize - Target chunk size in characters (default: 1000)
 * @param {number} options.chunkOverlap - Overlap between chunks in characters (default: 200)
 * @param {number} options.minChunkSize - Minimum chunk size (default: 100)
 * @return {Array<Object>} Array of chunk objects with text and metadata
 */
function chunkText(text, options = {}) {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
    minChunkSize = 100,
  } = options;

  if (!text || text.length === 0) {
    return [];
  }

  // Normalize whitespace
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (normalizedText.length <= chunkSize) {
    return [{
      text: normalizedText,
      startIndex: 0,
      endIndex: normalizedText.length,
      chunkIndex: 0,
      totalChunks: 1,
    }];
  }

  const chunks = [];
  let chunkIndex = 0;

  // Split by paragraphs first for better semantic boundaries
  const paragraphs = normalizedText.split(/\n\n+/).filter((p) => p.trim().length > 0);

  let currentChunk = "";
  let chunkStartIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    const paragraphWithNewline = paragraph + "\n\n";

    // If adding this paragraph would exceed chunk size
    if (currentChunk.length + paragraphWithNewline.length > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        text: currentChunk.trim(),
        startIndex: chunkStartIndex,
        endIndex: chunkStartIndex + currentChunk.length,
        chunkIndex: chunkIndex++,
        totalChunks: 0, // Will be set later
      });

      // Start new chunk with overlap
      const overlapText = getOverlapText(currentChunk, chunkOverlap);
      currentChunk = overlapText + paragraphWithNewline;
      // eslint-disable-next-line max-len
      chunkStartIndex = chunkStartIndex + currentChunk.length - overlapText.length - paragraphWithNewline.length;
    } else {
      // If paragraph itself is too large, split it by sentences
      if (paragraph.length > chunkSize) {
        // Save current chunk if it exists
        if (currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            startIndex: chunkStartIndex,
            endIndex: chunkStartIndex + currentChunk.length,
            chunkIndex: chunkIndex++,
            totalChunks: 0,
          });
          currentChunk = "";
        }

        // Split large paragraph by sentences
        const sentences = paragraph.split(/([.!?]+\s+)/).filter((s) => s.trim().length > 0);
        let sentenceChunk = "";
        let sentenceStartIndex = chunkStartIndex;

        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length > chunkSize && sentenceChunk.length > 0) {
            chunks.push({
              text: sentenceChunk.trim(),
              startIndex: sentenceStartIndex,
              endIndex: sentenceStartIndex + sentenceChunk.length,
              chunkIndex: chunkIndex++,
              totalChunks: 0,
            });

            const overlap = getOverlapText(sentenceChunk, chunkOverlap);
            sentenceChunk = overlap + sentence;
            // eslint-disable-next-line max-len
            sentenceStartIndex = sentenceStartIndex + sentenceChunk.length - overlap.length - sentence.length;
          } else {
            sentenceChunk += sentence;
          }
        }

        if (sentenceChunk.length > 0) {
          currentChunk = sentenceChunk + "\n\n";
          chunkStartIndex = sentenceStartIndex;
        }
      } else {
        currentChunk += paragraphWithNewline;
      }
    }
  }

  // Add the last chunk if it exists
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      startIndex: chunkStartIndex,
      endIndex: chunkStartIndex + currentChunk.length,
      chunkIndex: chunkIndex++,
      totalChunks: 0,
    });
  }

  // Set total chunks and filter out chunks that are too small
  const validChunks = chunks.filter((chunk) => chunk.text.length >= minChunkSize);
  validChunks.forEach((chunk) => {
    chunk.totalChunks = validChunks.length;
  });

  return validChunks;
}

/**
 * Gets overlap text from the end of a chunk
 * @param {string} text - The text to get overlap from
 * @param {number} overlapSize - Size of overlap in characters
 * @return {string} Overlap text
 */
function getOverlapText(text, overlapSize) {
  if (text.length <= overlapSize) {
    return text;
  }

  // Try to break at sentence boundaries
  const endText = text.slice(-overlapSize * 1.5); // Get more text to find sentence boundary
  const sentenceMatch = endText.match(/[.!?]+\s+[A-Z]/);

  if (sentenceMatch) {
    const sentenceEnd = endText.indexOf(sentenceMatch[0]) + sentenceMatch[0].length - 1;
    return endText.slice(sentenceEnd).trim();
  }

  // Fall back to word boundary
  const wordMatch = endText.match(/\s+\S+$/);
  if (wordMatch) {
    return endText.slice(endText.indexOf(wordMatch[0])).trim();
  }

  // Last resort: just take the last N characters
  return text.slice(-overlapSize);
}

/**
 * Normalize exhibit number by removing extra spaces around decimal points
 * @param {string} number - The exhibit number to normalize
 * @returns {string} Normalized exhibit number
 */
function normalizeExhibitNumber(number) {
  if (!number) return "";
  // Remove spaces around decimal points: "1 .2" -> "1.2"
  return number.replace(/\s*\.\s*/g, ".").trim();
}

/**
 * Adds metadata tags to chunks based on content analysis
 * @param {Array<Object>} chunks - Array of chunk objects
 * @param {string} fullText - The full text for context
 * @return {Array<Object>} Chunks with added metadata tags
 */
function addMetadataTags(chunks, fullText) {
  return chunks.map((chunk, index) => {
    const tags = [];
    const originalText = chunk.text;
    const text = originalText.toLowerCase();

    // -----------------------------------------------------------------------
    // Header detection
    // -----------------------------------------------------------------------
    // Check if the beginning of the chunk is a header
    // Use first 200 characters or first sentence, whichever is shorter
    let headerDetection = null;
    try {
      const headerCheckText = originalText.substring(0, 200);
      let followingText = "";
      if (index < chunks.length - 1 && chunks[index + 1] && chunks[index + 1].text) {
        followingText = chunks[index + 1].text.substring(0, 100);
      }
      headerDetection = detectHeader(headerCheckText, followingText);

      if (headerDetection && headerDetection.isHeader) {
        tags.push("header");
      }
    } catch (headerError) {
      // Silently fail header detection - it's not critical
      console.warn("Header detection error:", headerError);
      headerDetection = null;
    }

    // -----------------------------------------------------------------------
    // Entity / content detection
    // -----------------------------------------------------------------------

    // Detect potential character mentions (proper nouns, capitalized words)
    const characterMatches = originalText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (characterMatches && characterMatches.length > 0) {
      tags.push("has_characters");
    }

    // --- Temporal detection helpers ---------------------------------------
    const unique = (arr) => Array.from(new Set(arr));

    // Absolute numeric dates: 2024-01-15, 15/01/2024, 01/15/24, etc.
    const numericDateRegexes = [
      /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/g, // yyyy/mm/dd or yyyy-mm-dd
      /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g, // dd/mm/yyyy or mm/dd/yyyy
    ];

    // Month name dates: January 5, 2024; 5 January 2024; Jan 5th, etc.
    const monthNamePattern = "\\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
    const monthNameDateRegexes = [
      new RegExp(`${monthNamePattern}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?\\b`, "gi"),
      new RegExp(`\\d{1,2}(?:st|nd|rd|th)?\\s+${monthNamePattern}(?:,\\s*\\d{4})?\\b`, "gi"),
    ];

    // Years like 1999, 2024
    const yearRegex = /\b(19|20)\d{2}\b/g;

    // Relative day / time expressions: Day 3, Year 5, Week 2, etc.
    const relativeDayRegex = /\bday\s+(\d{1,3})\b/gi;
    const relativeWeekRegex = /\bweek\s+(\d{1,3})\b/gi;
    const relativeYearRegex = /\byear\s+(\d{1,3})\b/gi;

    // Times: 3:45 PM, 15:30, 08:00, etc.
    const timeRegexes = [
      /\b(1[0-2]|0?[1-9]):([0-5][0-9])\s*(am|pm)\b/gi, // 3:45 pm
      /\b([01]?[0-9]|2[0-3]):[0-5][0-9]\b/g, // 15:30
    ];

    const dateMatches = [];
    const timeMatches = [];
    const relativeDays = [];
    const relativeWeeks = [];
    const relativeYears = [];

    // Collect numeric date matches
    for (const r of numericDateRegexes) {
      let m;
      while ((m = r.exec(originalText)) !== null) {
        dateMatches.push(m[0]);
      }
    }

    // Collect month-name date matches
    for (const r of monthNameDateRegexes) {
      let m;
      while ((m = r.exec(originalText)) !== null) {
        dateMatches.push(m[0]);
      }
    }

    // Collect bare years (avoid duplicates where they're already part of a longer date)
    let yearMatch;
    while ((yearMatch = yearRegex.exec(originalText)) !== null) {
      const yearStr = yearMatch[0];
      // Only add if not already part of an existing date string we captured
      if (!dateMatches.some((d) => d.includes(yearStr))) {
        dateMatches.push(yearStr);
      }
    }

    // Relative day / week / year numbers
    let rel;
    while ((rel = relativeDayRegex.exec(text)) !== null) {
      relativeDays.push(`Day ${rel[1]}`);
    }
    while ((rel = relativeWeekRegex.exec(text)) !== null) {
      relativeWeeks.push(`Week ${rel[1]}`);
    }
    while ((rel = relativeYearRegex.exec(text)) !== null) {
      relativeYears.push(`Year ${rel[1]}`);
    }

    // Time-of-day matches
    for (const r of timeRegexes) {
      let m;
      while ((m = r.exec(originalText)) !== null) {
        timeMatches.push(m[0]);
      }
    }

    const hasAnyDateOrRelative =
      dateMatches.length > 0 ||
      relativeDays.length > 0 ||
      relativeWeeks.length > 0 ||
      relativeYears.length > 0;

    const hasAnyTime = timeMatches.length > 0;

    // Detect textual ordering / sequence words (original has_timeline logic)
    // eslint-disable-next-line max-len
    const timelineWordRegex = /\b(?:then|after|before|later|earlier|next|previous|first|last|finally|initially|subsequently|meanwhile|eventually|soon|earliest|latest)\b/i;
    const hasTimelineWords = timelineWordRegex.test(text);

    // Mark timeline-related tags
    if (hasTimelineWords || hasAnyDateOrRelative || hasAnyTime) {
      tags.push("has_timeline");
    }
    if (hasAnyDateOrRelative) {
      tags.push("has_dates");
    }
    if (hasAnyTime) {
      tags.push("has_times");
    }

    // Detect dialogue
    if (/["'"]/.test(originalText) || /^[A-Z][^.!?]*[.!?]$/m.test(originalText)) {
      tags.push("has_dialogue");
    }

    // Detect questions
    if (/\?/.test(originalText)) {
      tags.push("has_questions");
    }

    // Detect locations (common location words)
    // eslint-disable-next-line max-len
    if (/\b(?:in|at|on|near|beside|inside|outside|under|over|above|below)\s+[A-Z][a-z]+/i.test(originalText)) {
      tags.push("has_locations");
    }

    // -----------------------------------------------------------------------
    // Exhibit detection (English and Spanish)
    // -----------------------------------------------------------------------
    // Patterns for exhibit names: Exhibit 7, Exhibit A.1, Anexo 3, Prueba A, etc.
    // Improved patterns to handle spacing issues and trailing punctuation
    const exhibitPatterns = [
      // English: Exhibit, Exhibit A, Exhibit 7, Exhibit A.1, Exhibit 7-A
      // Handles: "Exhibit 1.2", "Exhibit 1 .2" (with space), "Exhibit 1.2." (with trailing period)
      /\bexhibit\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi,
      // Spanish: Anexo, Anexo A, Anexo 3, Anexo A.1
      /\banexo\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi,
      // Spanish: Prueba, Prueba A, Prueba 3, Prueba 1.2
      /\bprueba\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi,
      // Spanish: Evidencia, Evidencia A
      /\bevidencia\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi,
      // Spanish: Documento, Documento A
      /\bdocumento\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi,
    ];

    const exhibitMatches = [];
    let exhibitMetadata = [];

    for (const pattern of exhibitPatterns) {
      let match;
      // Reset regex lastIndex to ensure we get all matches
      pattern.lastIndex = 0;
      while ((match = pattern.exec(originalText)) !== null) {
        const fullMatch = match[0];
        const exhibitNumber = normalizeExhibitNumber(match[1]);
        const matchIndex = chunk.startIndex + match.index;

        exhibitMatches.push(fullMatch);
        exhibitMetadata.push({
          fullText: fullMatch,
          number: exhibitNumber,
          position: matchIndex,
          positionInChunk: match.index,
        });
      }
    }

    if (exhibitMatches.length > 0) {
      tags.push("has_exhibits");
    }

    // Chunk position tags
    if (index === 0) {
      tags.push("is_beginning");
    }
    if (index === chunks.length - 1) {
      tags.push("is_end");
    }
    if (index < chunks.length / 3) {
      tags.push("is_early");
    }
    if (index > chunks.length * 2 / 3) {
      tags.push("is_late");
    }

    const uniqueDates = unique(dateMatches);
    const uniqueTimes = unique(timeMatches);
    const uniqueRelativeDays = unique(relativeDays);
    const uniqueRelativeWeeks = unique(relativeWeeks);
    const uniqueRelativeYears = unique(relativeYears);

    return {
      ...chunk,
      tags,
      metadata: {
        wordCount: originalText.split(/\s+/).length,
        characterCount: originalText.length,
        hasDialogue: tags.includes("has_dialogue"),
        hasCharacters: tags.includes("has_characters"),
        hasTimeline: tags.includes("has_timeline"),
        isHeader: tags.includes("header"),
        headerConfidence: headerDetection ? headerDetection.confidence : null,
        // New, richer temporal metadata for downstream consumers (e.g. timeline UI)
        temporal: {
          hasTimelineWords,
          dates: uniqueDates,
          times: uniqueTimes,
          relativeDays: uniqueRelativeDays,
          relativeWeeks: uniqueRelativeWeeks,
          relativeYears: uniqueRelativeYears,
        },
        // Exhibit metadata
        hasExhibits: tags.includes("has_exhibits"),
        exhibits: exhibitMetadata.length > 0 ? exhibitMetadata : null,
      },
    };
  });
}

/**
 * Normalize exhibit number by removing extra spaces around decimal points
 * @param {string} number - The exhibit number to normalize
 * @returns {string} Normalized exhibit number
 */
function normalizeExhibitNumber(number) {
  if (!number) return "";
  // Remove spaces around decimal points: "1 .2" -> "1.2"
  return number.replace(/\s*\.\s*/g, ".").trim();
}

/**
 * Extract all exhibits from full text with their positions
 * This is used to find the actual exhibit content (usually after the name)
 * @param {string} fullText - The full document text
 * @return {Array<Object>} Array of exhibit objects with name, number, and position
 */
function extractExhibits(fullText) {
  if (!fullText) return [];

  // Improved patterns to handle spacing issues and trailing punctuation
  const exhibitPatterns = [
    // English: Exhibit, Exhibit A, Exhibit 7, Exhibit A.1, Exhibit 7-A
    // Handles: "Exhibit 1.2", "Exhibit 1 .2" (with space), "Exhibit 1.2." (with trailing period)
    { pattern: /\bexhibit\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "exhibit" },
    // Spanish: Anexo, Anexo A, Anexo 3, Anexo A.1
    { pattern: /\banexo\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "anexo" },
    // Spanish: Prueba, Prueba A, Prueba 3, Prueba 1.2
    { pattern: /\bprueba\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "prueba" },
    // Spanish: Evidencia, Evidencia A
    { pattern: /\bevidencia\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "evidencia" },
    // Spanish: Documento, Documento A
    { pattern: /\bdocumento\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "documento" },
    // English: Figure, Figure 1, Figure 1.2
    { pattern: /\bfigure\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "figure" },
    // Spanish: Figura, Figura 1, Figura 1.2
    { pattern: /\bfigura\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "figura" },
    // English: Appendix, Appendix A, Appendix 1
    { pattern: /\bappendix\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "appendix" },
    // English: Annex, Annex A, Annex 1
    { pattern: /\bannex\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "annex" },
    // English: Attachment, Attachment A, Attachment 1
    { pattern: /\battachment\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "attachment" },
    // English: Chart, Chart 1, Chart A
    { pattern: /\bchart\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "chart" },
    // English: Table, Table 1, Table A
    { pattern: /\btable\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "table" },
    // Spanish: Tabla, Tabla 1, Tabla A
    { pattern: /\btabla\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "tabla" },
    // English: Diagram, Diagram 1, Diagram A
    { pattern: /\bdiagram\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "diagram" },
    // Spanish: Diagrama, Diagrama 1, Diagrama A
    { pattern: /\bdiagrama\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "diagrama" },
    // English: Schedule, Schedule 1, Schedule A
    { pattern: /\bschedule\s+([A-Z0-9]+(?:\s*\.\s*[0-9]+)?(?:-[A-Z0-9]+)?)\.?\b/gi, type: "schedule" },
  ];

  const allExhibits = [];

  for (const { pattern, type } of exhibitPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(fullText)) !== null) {
      // Normalize the exhibit number to handle spacing issues
      const normalizedNumber = normalizeExhibitNumber(match[1]);
      
      allExhibits.push({
        fullText: match[0],
        number: normalizedNumber,
        position: match.index,
        type: type,
      });
    }
  }

  // Sort by position
  allExhibits.sort((a, b) => a.position - b.position);

  // Group by exhibit number and keep only the FIRST occurrence of each
  // (since the first mention is more likely to be the actual exhibit label/header)
  // This prevents later mentions from overwriting the correct exhibit name
  const exhibitMap = new Map();
  allExhibits.forEach((exhibit) => {
    // Create a normalized key for deduplication
    const normalizedNumber = normalizeExhibitNumber(exhibit.number);
    const key = `${exhibit.type}-${normalizedNumber.toLowerCase()}`;
    const existing = exhibitMap.get(key);
    
    // Keep the first occurrence (earlier position) instead of the last
    // This ensures we get the actual exhibit label rather than a later reference
    if (!existing || exhibit.position < existing.position) {
      exhibitMap.set(key, exhibit);
    }
  });

  return Array.from(exhibitMap.values());
}

module.exports = {
  chunkText,
  addMetadataTags,
  extractExhibits,
};


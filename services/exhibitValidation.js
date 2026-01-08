/**
 * Service for validating exhibit names using Google Gemini Vision API
 */

/**
 * Validate an exhibit name by analyzing the exhibit image
 * @param {string} imageDataUrl - Base64 data URL of the exhibit page image
 * @param {string} extractedName - The exhibit name extracted from text
 * @returns {Promise<Object>} Validation result with corrected name if needed
 */
export async function validateExhibitName(imageDataUrl, extractedName) {
  try {
    const response = await fetch('/api/ai/validate-exhibit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageDataUrl,
        extractedName
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error validating exhibit name:', error);
    return {
      success: false,
      validated: false,
      extractedName: extractedName,
      error: error.message
    };
  }
}

/**
 * Extract exhibit number from a full exhibit name
 * @param {string} exhibitName - Full exhibit name (e.g., "Exhibit 10", "Prueba 1.2")
 * @returns {Object} Object with type and number
 */
export function parseExhibitName(exhibitName) {
  if (!exhibitName) return { type: null, number: null };

  const normalized = exhibitName.trim();
  
  // Handle multiple exhibits (e.g., "Exhibit 5, Exhibit 6" or "Exhibit 5; Exhibit 6")
  // Take the first one
  const firstExhibit = normalized.split(/[,;]/)[0].trim();
  
  // Match patterns like "Exhibit 10", "Prueba 1.2", "Anexo A", etc.
  const patterns = [
    { regex: /^exhibit\s+(.+)$/i, type: 'exhibit' },
    { regex: /^anexo\s+(.+)$/i, type: 'anexo' },
    { regex: /^prueba\s+(.+)$/i, type: 'prueba' },
    { regex: /^evidencia\s+(.+)$/i, type: 'evidencia' },
    { regex: /^documento\s+(.+)$/i, type: 'documento' }
  ];

  for (const pattern of patterns) {
    const match = firstExhibit.match(pattern.regex);
    if (match) {
      return {
        type: pattern.type,
        number: match[1].trim()
      };
    }
  }

  return { type: null, number: null };
}


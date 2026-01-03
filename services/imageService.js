/**
 * Service for fetching and generating character images
 * Uses Google Custom Search API for web search, falls back to Google AI (Nano Banana Pro) for generation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Check if a URL is likely to be a direct image URL
 * @param {string} url - URL to check
 * @returns {boolean} - True if URL appears to be a direct image URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const lowerUrl = url.toLowerCase();
  
  // Check for image file extensions
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));
  
  // Check for common image hosting patterns
  const imageHostingPatterns = [
    '/image/', '/img/', '/photo/', '/picture/', '/avatar/',
    'i.imgur.com', 'cdn.', 'static.', 'images.', 'media.',
    'upload', 'asset', 'headshot', 'portrait'
  ];
  const hasImageHostingPattern = imageHostingPatterns.some(pattern => lowerUrl.includes(pattern));
  
  // Exclude crawler/widget URLs that aren't direct images
  const invalidPatterns = [
    '/crawler/', '/widget/', '/seo/', 'lookaside.',
    'google_widget', 'facebook.com/l.php', 'redirect'
  ];
  const hasInvalidPattern = invalidPatterns.some(pattern => lowerUrl.includes(pattern));
  
  // URL is valid if it has an image extension OR image hosting pattern, AND doesn't have invalid patterns
  return !hasInvalidPattern && (hasImageExtension || hasImageHostingPattern);
}

/**
 * Fetch image from Google Custom Search API
 * @param {string} query - Search query for the character
 * @param {string} apiKey - Google Custom Search API key
 * @param {string} searchEngineId - Google Custom Search Engine ID (CX)
 * @returns {Promise<string|null>} - Image URL or null if not found
 */
async function fetchImageFromGoogle(query, apiKey, searchEngineId) {
  if (!apiKey || !searchEngineId) {
    return null;
  }

  try {
    // Search for portrait/headshot photos
    // Use the query as-is if it already contains search terms, otherwise add "portrait"
    // The backend may already provide optimized queries like "Name headshot"
    const searchQuery = query.includes('portrait') || query.includes('headshot') 
      ? query 
      : `${query} portrait`;
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(searchQuery)}&cx=${encodeURIComponent(searchEngineId)}&key=${encodeURIComponent(apiKey)}&searchType=image&num=1&safe=active`;
    
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData = null;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use raw text
      }
      
      // If it's a 403 (quota/rate limit), log it but don't throw - let it fall through to Google AI generation
      if (response.status === 403) {
        console.warn(`Google Custom Search API quota/rate limit reached (403). Error: ${errorData?.error?.message || errorText.substring(0, 100)}`);
        return null;
      }
      
      console.warn(`Google Custom Search API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.items && data.items.length > 0) {
      const firstItem = data.items[0];
      const imageUrl = firstItem?.link;
      // Only return if we have a valid link URL that appears to be a direct image URL
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
        const isValid = isValidImageUrl(imageUrl);
        if (isValid) {
          return imageUrl;
        } else {
          // Fall through to return null, which will trigger fallback
        }
      } else {
        // Fall through to return null, which will trigger fallback
      }
    }

    return null;
  } catch (error) {
    console.warn('Error fetching image from Google Custom Search:', error.message);
    return null;
  }
}

/**
 * Generate image using Google AI (Nano Banana Pro / gemini-3-pro-image-preview)
 * @param {string} characterName - Character name
 * @param {string} description - Character description
 * @param {string} apiKey - Google AI API key
 * @returns {Promise<string|null>} - Base64 data URL or null if generation fails
 */
async function generateImageWithGoogleAI(characterName, description, apiKey, retryCount = 0) {
  const maxRetries = 2; // Maximum number of retries for 429 errors
  const baseDelay = 5000; // Base delay in milliseconds (5 seconds)
  
  if (!apiKey) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-pro-image-preview' 
    });

    // Create a prompt for generating a professional headshot
    const prompt = `Professional headshot portrait of ${characterName}${description ? `, ${description}` : ''}. High quality, realistic, business professional, clean background, studio lighting, photorealistic, 4K quality.`;

    const result = await model.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ text: prompt }] 
      }],
      generationConfig: {
        // Required for Nano Banana models to output images
        responseModalities: ['IMAGE']
        // Note: Additional parameters like aspectRatio, resolution, etc.
        // may need to be set differently depending on SDK version
        // If needed, these can be added as separate config options
      }
    });

    const response = await result.response;
    
    // Check if we got a valid response with image data
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const imagePart = candidate.content.parts[0];
        
        // The image is returned as inlineData with base64 data
        if (imagePart.inlineData) {
          const { data, mimeType } = imagePart.inlineData;
          return `data:${mimeType};base64,${data}`;
        }
      }
    }

    console.warn('Google AI response did not contain image data');
    return null;
  } catch (error) {
    console.warn('Error generating image with Google AI:', error.message);
    
    // Check if it's a 429 (rate limit/quota) error and we haven't exceeded max retries
    const is429Error = error.message?.includes('429') || error.message?.includes('Too Many Requests');
    if (is429Error && retryCount < maxRetries) {
      // Try to extract retry delay from error message (e.g., "Please retry in 56.121911973s")
      let retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
      const retryMatch = error.message.match(/retry in ([\d.]+)s/i);
      if (retryMatch) {
        retryDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000); // Convert seconds to milliseconds
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Retry the generation
      return generateImageWithGoogleAI(characterName, description, apiKey, retryCount + 1);
    }
    
    if (error.message) {
      console.warn('Error details:', error.message);
    }
    return null;
  }
}

/**
 * Get or generate image for a character
 * @param {Object} character - Character object with name and description
 * @param {Object} options - Options object
 * @param {string} options.googleSearchApiKey - Google Custom Search API key (optional)
 * @param {string} options.googleSearchEngineId - Google Custom Search Engine ID (CX) (optional)
 * @param {string} options.googleAiKey - Google AI API key (optional)
 * @param {string} options.searchQuery - Pre-generated search query (optional)
 * @returns {Promise<Object>} - Object with imageUrl and imageSource
 */
export async function getCharacterImage(character, options = {}) {
  const { googleSearchApiKey, googleSearchEngineId, googleAiKey } = options;
  const characterName = character.name || '';
  const description = character.description || '';
  // Use imageSearchQuery from character if available, otherwise use name
  const searchQuery = character.imageSearchQuery || characterName;

  // Try Google Custom Search first if API key and search engine ID are available
  let googleImage = null;
  if (googleSearchApiKey && googleSearchEngineId) {
    googleImage = await fetchImageFromGoogle(searchQuery, googleSearchApiKey, googleSearchEngineId);
    if (googleImage) {
      return {
        imageUrl: googleImage,
        imageSource: 'google',
        hasImage: true
      };
    }
  }

  // Fall back to Google AI generation if search failed or quota exceeded
  if (googleAiKey) {
    const generatedImage = await generateImageWithGoogleAI(characterName, description, googleAiKey);
    if (generatedImage) {
      return {
        imageUrl: generatedImage,
        imageSource: 'generated',
        hasImage: true
      };
    }
  }

  // No image available
  return {
    imageUrl: null,
    imageSource: null,
    hasImage: false
  };
}

/**
 * Batch process images for multiple characters
 * @param {Array} characters - Array of character objects
 * @param {Object} options - Options object
 * @returns {Promise<Array>} - Array of characters with image data
 */
export async function getCharacterImagesBatch(characters, options = {}) {
  // Process characters sequentially with a small delay to avoid rate limiting
  // Google Custom Search API has a free tier of 100 queries/day
  const results = [];
  for (let i = 0; i < characters.length; i++) {
    const character = characters[i];
    const imageData = await getCharacterImage(character, options);
    results.push({
      ...character,
      ...imageData
    });
    
    // Add a small delay between requests to avoid rate limiting (except for last item)
    if (i < characters.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
    }
  }

  return results;
}


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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:15',message:'fetchImageFromGoogle entry',data:{hasApiKey:!!apiKey,hasSearchEngineId:!!searchEngineId,apiKeyLength:apiKey?.length||0,searchEngineIdLength:searchEngineId?.length||0,query:query},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!apiKey || !searchEngineId) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:17',message:'Missing API key or Search Engine ID',data:{hasApiKey:!!apiKey,hasSearchEngineId:!!searchEngineId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:24',message:'Google API request',data:{searchQuery:searchQuery,urlPrefix:url.substring(0,80),hasSearchEngineId:!!searchEngineId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const response = await fetch(url);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:28',message:'Google API response status',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (!response.ok) {
      const errorText = await response.text();
      let errorData = null;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use raw text
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:32',message:'Google API error response',data:{status:response.status,errorCode:errorData?.error?.code,errorMessage:errorData?.error?.message,errorText:errorText.substring(0,200),isQuotaError:response.status===403||errorData?.error?.code===403},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // If it's a 403 (quota/rate limit), log it but don't throw - let it fall through to Google AI generation
      if (response.status === 403) {
        console.warn(`Google Custom Search API quota/rate limit reached (403). Error: ${errorData?.error?.message || errorText.substring(0, 100)}`);
        return null;
      }
      
      console.warn(`Google Custom Search API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:40',message:'Google API response data',data:{hasItems:!!data.items,itemsCount:data.items?.length||0,hasError:!!data.error,errorMessage:data.error?.message||null,responseKeys:Object.keys(data)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (data.items && data.items.length > 0) {
      const firstItem = data.items[0];
      const imageUrl = firstItem?.link;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:44',message:'Google image found',data:{imageUrl:imageUrl?.substring(0,80)||null,hasLink:!!imageUrl,linkType:typeof imageUrl,firstItemKeys:Object.keys(firstItem||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Only return if we have a valid link URL that appears to be a direct image URL
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
        const isValid = isValidImageUrl(imageUrl);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:78',message:'Validating image URL',data:{imageUrl:imageUrl?.substring(0,100)||null,isValidImageUrl:isValid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (isValid) {
          return imageUrl;
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:84',message:'Google returned invalid image URL (crawler/widget)',data:{imageUrl:imageUrl?.substring(0,100)||null,willTriggerFallback:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          // Fall through to return null, which will trigger fallback
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:90',message:'Google returned items but no valid link',data:{hasItems:!!data.items,itemsCount:data.items?.length||0,firstItemHasLink:!!firstItem?.link},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // Fall through to return null, which will trigger fallback
      }
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:50',message:'No images in Google response',data:{hasItems:!!data.items},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return null;
  } catch (error) {
    console.warn('Error fetching image from Google Custom Search:', error.message);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:54',message:'Google fetch exception',data:{errorMessage:error.message,errorStack:error.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
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
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:100',message:'generateImageWithGoogleAI entry',data:{characterName:characterName,hasDescription:!!description,descriptionLength:description?.length||0,hasApiKey:!!apiKey,apiKeyLength:apiKey?.length||0,retryCount:retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  if (!apiKey) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:103',message:'No API key for Google AI',data:{characterName:characterName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-pro-image-preview' 
    });

    // Create a prompt for generating a professional headshot
    const prompt = `Professional headshot portrait of ${characterName}${description ? `, ${description}` : ''}. High quality, realistic, business professional, clean background, studio lighting, photorealistic, 4K quality.`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:115',message:'Calling Google AI generateContent',data:{characterName:characterName,promptLength:prompt.length,promptPrefix:prompt.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:131',message:'Google AI response received',data:{characterName:characterName,hasCandidates:!!response.candidates,candidatesCount:response.candidates?.length||0,hasContent:!!response.candidates?.[0]?.content,hasParts:!!response.candidates?.[0]?.content?.parts,partsCount:response.candidates?.[0]?.content?.parts?.length||0,hasInlineData:!!response.candidates?.[0]?.content?.parts?.[0]?.inlineData,responseKeys:Object.keys(response)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // Check if we got a valid response with image data
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const imagePart = candidate.content.parts[0];
        
        // The image is returned as inlineData with base64 data
        if (imagePart.inlineData) {
          const { data, mimeType } = imagePart.inlineData;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:142',message:'Google AI image data found',data:{characterName:characterName,mimeType:mimeType,dataLength:data?.length||0,dataPrefix:data?.substring(0,50)||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          return `data:${mimeType};base64,${data}`;
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:147',message:'No inlineData in image part',data:{characterName:characterName,imagePartKeys:Object.keys(imagePart||{}),hasText:!!imagePart?.text,textPrefix:imagePart?.text?.substring(0,100)||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:152',message:'No content or parts in candidate',data:{characterName:characterName,hasContent:!!candidate?.content,hasParts:!!candidate?.content?.parts,candidateKeys:Object.keys(candidate||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:157',message:'No candidates in response',data:{characterName:characterName,responseKeys:Object.keys(response)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    }

    console.warn('Google AI response did not contain image data');
    return null;
  } catch (error) {
    console.warn('Error generating image with Google AI:', error.message);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:163',message:'Google AI generation exception',data:{characterName:characterName,errorMessage:error.message,errorName:error.name,errorStack:error.stack?.substring(0,300)||null,is429Error:error.message?.includes('429')||error.message?.includes('Too Many Requests'),retryCount:retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // Check if it's a 429 (rate limit/quota) error and we haven't exceeded max retries
    const is429Error = error.message?.includes('429') || error.message?.includes('Too Many Requests');
    if (is429Error && retryCount < maxRetries) {
      // Try to extract retry delay from error message (e.g., "Please retry in 56.121911973s")
      let retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
      const retryMatch = error.message.match(/retry in ([\d.]+)s/i);
      if (retryMatch) {
        retryDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000); // Convert seconds to milliseconds
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:238',message:'Retrying Google AI generation after 429 error',data:{characterName:characterName,retryCount:retryCount+1,retryDelay:retryDelay},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Retry the generation
      return generateImageWithGoogleAI(characterName, description, apiKey, retryCount + 1);
    }
    
    // Don't log full error in production, but log enough for debugging
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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:119',message:'getCharacterImage entry',data:{characterName:characterName,hasGoogleSearchApiKey:!!googleSearchApiKey,hasGoogleSearchEngineId:!!googleSearchEngineId,hasGoogleAiKey:!!googleAiKey,searchQuery:searchQuery},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  // Try Google Custom Search first if API key and search engine ID are available
  let googleImage = null;
  if (googleSearchApiKey && googleSearchEngineId) {
    googleImage = await fetchImageFromGoogle(searchQuery, googleSearchApiKey, googleSearchEngineId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:177',message:'Google search result',data:{characterName:characterName,googleImageFound:!!googleImage,imageUrlPrefix:googleImage?.substring(0,80)||null,willTryFallback:!googleImage&&!!googleAiKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (googleImage) {
      return {
        imageUrl: googleImage,
        imageSource: 'google',
        hasImage: true
      };
    }
  }

  // Fall back to Google AI generation if search failed or quota exceeded
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:190',message:'Checking fallback conditions',data:{characterName:characterName,hasGoogleAiKey:!!googleAiKey,googleImageWasNull:googleImage===null,willAttemptFallback:!!googleAiKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (googleAiKey) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:193',message:'Falling back to Google AI generation',data:{characterName:characterName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const generatedImage = await generateImageWithGoogleAI(characterName, description, googleAiKey);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:196',message:'Google AI generation result',data:{characterName:characterName,generatedImageFound:!!generatedImage,imageUrlPrefix:generatedImage?.substring(0,80)||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (generatedImage) {
      return {
        imageUrl: generatedImage,
        imageSource: 'generated',
        hasImage: true
      };
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:241',message:'Google AI generation returned null',data:{characterName:characterName,hasGoogleAiKey:!!googleAiKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
  } else {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:245',message:'No Google AI key for fallback',data:{characterName:characterName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  }

  // No image available
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a4913c7c-1e6d-4c0a-8f80-1cbb76ae61f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'imageService.js:252',message:'Returning no image - all methods failed',data:{characterName:characterName,hadGoogleSearch:!!(googleSearchApiKey&&googleSearchEngineId),googleImageWasNull:googleImage===null,hadGoogleAiKey:!!googleAiKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
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


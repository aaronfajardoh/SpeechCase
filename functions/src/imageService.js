/**
 * Service for fetching and generating character images
 * Uses Google Custom Search API for web search, falls back to Google AI for generation
 * Converted to CommonJS for Firebase Functions
 */

const {GoogleGenerativeAI} = require("@google/generative-ai");
const https = require("https");

/**
 * Check if a URL is likely to be a direct image URL
 * @param {string} url - URL to check
 * @return {boolean} True if URL appears to be a direct image URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  const lowerUrl = url.toLowerCase();

  // Check for image file extensions
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];
  const hasImageExtension = imageExtensions.some((ext) => lowerUrl.includes(ext));

  // Check for common image hosting patterns
  const imageHostingPatterns = [
    "/image/", "/img/", "/photo/", "/picture/", "/avatar/",
    "i.imgur.com", "cdn.", "static.", "images.", "media.",
    "upload", "asset", "headshot", "portrait",
  ];
  const hasImageHostingPattern = imageHostingPatterns.some((pattern) => lowerUrl.includes(pattern));

  // Exclude crawler/widget URLs that aren't direct images
  const invalidPatterns = [
    "/crawler/", "/widget/", "/seo/", "lookaside.",
    "google_widget", "facebook.com/l.php", "redirect",
  ];
  const hasInvalidPattern = invalidPatterns.some((pattern) => lowerUrl.includes(pattern));

  return !hasInvalidPattern && (hasImageExtension || hasImageHostingPattern);
}

/**
 * Fetch image from Google Custom Search API
 * @param {string} query - Search query for the character
 * @param {string} apiKey - Google Custom Search API key
 * @param {string} searchEngineId - Google Custom Search Engine ID (CX)
 * @return {Promise<string|null>} Image URL or null if not found
 */
async function fetchImageFromGoogle(query, apiKey, searchEngineId) {
  if (!apiKey || !searchEngineId) {
    return null;
  }

  try {
    // Search for portrait/headshot photos
    const searchQuery = query.includes("portrait") || query.includes("headshot") ?
      query :
      `${query} portrait`;
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(searchQuery)}&cx=${encodeURIComponent(searchEngineId)}&key=${encodeURIComponent(apiKey)}&searchType=image&num=1&safe=active`;

    // Use Node.js https module instead of fetch for compatibility
    const data = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 403) {
            // Quota/rate limit - log but don't throw
            let errorData = null;
            try {
              errorData = JSON.parse(responseData);
            } catch (e) {
              // Not JSON
            }
            const errorMessage = (errorData && errorData.error && errorData.error.message) ||
                responseData.substring(0, 100);
            console.warn(
                `Google Custom Search API quota/rate limit reached (403). Error: ${errorMessage}`);
            resolve(null);
            return;
          }

          if (res.statusCode !== 200) {
            console.warn(`Google Custom Search API error: ${res.statusCode}`);
            resolve(null);
            return;
          }

          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            console.warn("Error parsing Google Custom Search response:", e);
            resolve(null);
          }
        });
      }).on("error", (err) => {
        console.warn("Error fetching from Google Custom Search:", err.message);
        resolve(null);
      });
    });

    if (!data) {
      return null;
    }
    if (data.items && data.items.length > 0) {
      const firstItem = data.items[0];
      const imageUrl = firstItem && firstItem.link;
      if (imageUrl && typeof imageUrl === "string" && imageUrl.trim().length > 0) {
        const isValid = isValidImageUrl(imageUrl);
        if (isValid) {
          return imageUrl;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn("Error fetching image from Google Custom Search:", error.message);
    return null;
  }
}

/**
 * Generate image using Google AI
 * @param {string} characterName - Character name
 * @param {string} description - Character description
 * @param {string} apiKey - Google AI API key
 * @param {number} retryCount - Retry count for rate limit errors
 * @return {Promise<string|null>} Base64 data URL or null if generation fails
 */
async function generateImageWithGoogleAI(characterName, description, apiKey, retryCount = 0) {
  const maxRetries = 2;
  const baseDelay = 5000;

  if (!apiKey) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
    });

    const prompt = `Professional headshot portrait of ${characterName}${description ? `, ${description}` : ""}. High quality, realistic, business professional, clean background, studio lighting, photorealistic, 4K quality.`;

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{text: prompt}],
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    });

    const response = await result.response;

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const imagePart = candidate.content.parts[0];

        if (imagePart.inlineData) {
          const {data, mimeType} = imagePart.inlineData;
          return `data:${mimeType};base64,${data}`;
        }
      }
    }

    console.warn("Google AI response did not contain image data");
    return null;
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    console.warn("Error generating image with Google AI:", errorMessage);

    const is429Error = (errorMessage && errorMessage.includes("429")) || (errorMessage && errorMessage.includes("Too Many Requests"));
    if (is429Error && retryCount < maxRetries) {
      let retryDelay = baseDelay * Math.pow(2, retryCount);
      const retryMatch = errorMessage && errorMessage.match(/retry in ([\d.]+)s/i);
      if (retryMatch) {
        retryDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000);
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return generateImageWithGoogleAI(characterName, description, apiKey, retryCount + 1);
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
 * @return {Promise<Object>} Object with imageUrl and imageSource
 */
async function getCharacterImage(character, options = {}) {
  const {googleSearchApiKey, googleSearchEngineId, googleAiKey} = options;
  const characterName = character.name || "";
  const description = character.description || "";
  const searchQuery = character.imageSearchQuery || characterName;

  // Try Google Custom Search first
  let googleImage = null;
  if (googleSearchApiKey && googleSearchEngineId) {
    googleImage = await fetchImageFromGoogle(searchQuery, googleSearchApiKey, googleSearchEngineId);
    if (googleImage) {
      return {
        imageUrl: googleImage,
        imageSource: "google",
        hasImage: true,
      };
    }
  }

  // Fall back to Google AI generation
  if (googleAiKey) {
    const generatedImage = await generateImageWithGoogleAI(characterName, description, googleAiKey);
    if (generatedImage) {
      return {
        imageUrl: generatedImage,
        imageSource: "generated",
        hasImage: true,
      };
    }
  }

  return {
    imageUrl: null,
    imageSource: null,
    hasImage: false,
  };
}

/**
 * Batch process images for multiple characters
 * @param {Array} characters - Array of character objects
 * @param {Object} options - Options object
 * @return {Promise<Array>} Array of characters with image data
 */
async function getCharacterImagesBatch(characters, options = {}) {
  const results = [];
  for (let i = 0; i < characters.length; i++) {
    const character = characters[i];
    const imageData = await getCharacterImage(character, options);
    const mergedCharacter = {
      ...character,
      ...imageData,
    };
    results.push(mergedCharacter);

    // Add a small delay between requests to avoid rate limiting
    if (i < characters.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

module.exports = {
  getCharacterImage,
  getCharacterImagesBatch,
};


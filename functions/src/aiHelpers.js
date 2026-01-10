/**
 * AI Helper Functions
 * Utilities for Gemini Vision analysis and image generation
 */

const {GoogleGenerativeAI} = require("@google/generative-ai");
const admin = require("firebase-admin");


/**
 * Analyze a screenshot/snip image using Gemini Vision
 * @param {string} base64Image - Base64 data URL (format: data:image/png;base64,...)
 * @param {string} apiKey - Google AI API key
 * @return {Promise<string|null>} Description of image content or null on error
 */
async function analyzeSnipWithGemini(base64Image, apiKey) {
  if (!apiKey) {
    return null;
  }

  if (!base64Image || typeof base64Image !== "string") {
    return null;
  }

  try {
    // Extract base64 data and mime type from data URL
    const dataUrlMatch = base64Image.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      console.warn("Invalid base64 data URL format");
      return null;
    }

    const mimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];

    const genAI = new GoogleGenerativeAI(apiKey);
    // Try multiple model names in order of preference
    const modelNames = [
      "gemini-1.5-pro-latest",
      "gemini-1.5-pro",
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash-thinking-exp-01-21",
    ];

    let lastError = null;
    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
        });

        const prompt = "Analyze this image content. Provide a concise description of what it shows (e.g., 'Table showing Q3 financial results', 'Diagram of the supply chain').";

        const result = await model.generateContent({
          contents: [{
            role: "user",
            parts: [
              {text: prompt},
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
            ],
          }],
        });

        const response = await result.response;
        const description = response.text();


        if (description && description.trim().length > 0) {
          return description.trim();
        }
        return null;
      } catch (modelError) {
        // Try next model
        lastError = modelError;
        continue;
      }
    }

    // All models failed
    const errorMessage = lastError && lastError.message ? lastError.message : String(lastError);
    console.warn("Error analyzing snip with Gemini (all models failed):", errorMessage);
    return null;
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    console.warn("Error analyzing snip with Gemini:", errorMessage);
    return null;
  }
}

/**
 * Generate a conceptual image using Gemini 3 Pro Image and upload to Firebase Storage
 * @param {string} summaryText - The generated summary text
 *   (required if directPrompt is not provided)
 * @param {string} uid - User ID
 * @param {string} documentId - Document ID
 * @param {string} apiKey - Google AI API key
 * @param {string|null} directPrompt - Optional direct prompt for image generation
 *   (skips prompt generation step)
 * @param {string} imageSuffix - Optional suffix for unique image filename
 *   (e.g., "1", "2", "3")
 * @return {Promise<Object|null>} Object with imageUrl and prompt, or null on error
 */
async function generateConceptImage(summaryText, uid, documentId, apiKey, directPrompt = null, imageSuffix = "") {
  if (!apiKey) {
    return null;
  }

  let imagePrompt = null;

  // If directPrompt is provided, use it directly (skip prompt generation)
  if (directPrompt) {
    imagePrompt = directPrompt.trim();

    // Style enforcement: check if prompt contains style keywords
    const styleKeywords = [
      "line drawing",
      "sketch",
      "minimalist",
      "business sketch",
      "illustration",
      "diagram",
      "drawing",
    ];
    const hasStyleKeyword = styleKeywords.some((keyword) =>
      imagePrompt.toLowerCase().includes(keyword.toLowerCase()),
    );

    // If no style keyword found, append appropriate style instruction
    if (!hasStyleKeyword) {
      imagePrompt = `${imagePrompt}, business line drawing style`;
    }
  } else {
    // Backward compatibility: generate prompt from summary text
    if (!summaryText || summaryText.trim().length === 0) {
      return null;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      // Step 1: Generate image prompt using Gemini - try multiple models
      const textModelNames = [
        "gemini-1.5-pro-latest",
        "gemini-1.5-pro",
        "gemini-2.0-flash-exp",
      ];

      let promptResult = null;
      let lastError = null;
      for (const modelName of textModelNames) {
        try {
          const flashModel = genAI.getGenerativeModel({
            model: modelName,
          });

          const promptGenerationPrompt = `Create an image generation prompt for a business-style line drawing or conceptual illustration that represents this summary. The image should be professional, clean, and suitable for a business case study context. Keep the prompt concise (1-2 sentences).

Summary:
${summaryText.substring(0, 2000)}`; // Limit summary length for prompt generation

          promptResult = await flashModel.generateContent({
            contents: [{
              role: "user",
              parts: [{text: promptGenerationPrompt}],
            }],
          });
          break; // Success, exit loop
        } catch (modelError) {
          lastError = modelError;
          continue; // Try next model
        }
      }

      if (!promptResult) {
        const errorMsg = lastError && lastError.message ? lastError.message : String(lastError);
        console.warn("Failed to generate image prompt with any model:", errorMsg);
        return null;
      }

      const promptResponse = await promptResult.response;
      imagePrompt = promptResponse.text().trim();

      if (!imagePrompt || imagePrompt.length === 0) {
        console.warn("Failed to generate image prompt");
        return null;
      }
    } catch (error) {
      const errorMessage = error && error.message ? error.message : String(error);
      console.warn("Error generating image prompt:", errorMessage);
      return null;
    }
  }

  // Step 2: Generate image using Gemini 3 Pro Image
  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const imageModel = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
    });

    const imageResult = await imageModel.generateContent({
      contents: [{
        role: "user",
        parts: [{text: imagePrompt}],
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    });

    const imageResponse = await imageResult.response;

    if (!imageResponse.candidates || imageResponse.candidates.length === 0) {
      console.warn("Gemini image generation returned no candidates");
      return null;
    }

    const candidate = imageResponse.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.warn("Gemini image generation candidate has no content parts");
      return null;
    }

    const imagePart = candidate.content.parts[0];
    if (!imagePart.inlineData) {
      console.warn("Gemini image generation response does not contain inline data");
      return null;
    }

    const {data: base64ImageData, mimeType} = imagePart.inlineData;

    // Step 3: Convert base64 to Buffer
    const imageBuffer = Buffer.from(base64ImageData, "base64");

    // Step 4: Upload to Firebase Storage with unique filename if imageSuffix is provided
    const bucket = admin.storage().bucket();
    const filename = imageSuffix ? `concept-image-${imageSuffix}.png` : "concept-image.png";
    const storagePath = `users/${uid}/summaries/${documentId}/${filename}`;
    const file = bucket.file(storagePath);

    await file.save(imageBuffer, {
      metadata: {
        contentType: mimeType || "image/png",
        cacheControl: "public, max-age=31536000",
      },
    });

    // Step 5: Get public download URL
    await file.makePublic();
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;


    return {
      imageUrl: imageUrl,
      prompt: imagePrompt,
    };
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    console.warn("Error generating concept image:", errorMessage);
    return null;
  }
}

module.exports = {
  analyzeSnipWithGemini,
  generateConceptImage,
};

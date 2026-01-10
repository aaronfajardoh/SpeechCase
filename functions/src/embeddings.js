/**
 * Embedding service using OpenAI API
 * Generates vector embeddings for text chunks
 */

const OpenAI = require("openai");

let openaiClient = null;
let deepseekClient = null;

/**
 * Initialize OpenAI client
 * @param {string} apiKey - OpenAI API key
 */
function initializeOpenAI(apiKey) {
  if (!apiKey) {
    throw new Error("OpenAI API key is required");
  }
  openaiClient = new OpenAI({apiKey});
}

/**
 * Get OpenAI client (initializes if needed)
 * @return {OpenAI} OpenAI client instance
 */
function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Set OPENAI_API_KEY environment variable.");
    }
    initializeOpenAI(apiKey);
  }
  return openaiClient;
}

/**
 * Get DeepSeek client (initializes if needed)
 * DeepSeek API is compatible with OpenAI SDK
 * @return {OpenAI} DeepSeek client instance
 */
function getDeepSeekClient() {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable.");
    }
    deepseekClient = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.deepseek.com",
    });
  }
  return deepseekClient;
}

/**
 * Generate embeddings for a single text chunk
 * @param {string} text - Text to embed
 * @param {Object} options - Options for embedding generation
 * @param {string} options.model - Embedding model to use (default: 'text-embedding-3-small')
 * @return {Promise<Array<number>>} Embedding vector
 */
async function generateEmbedding(text, options = {}) {
  const {model = "text-embedding-3-small"} = options;

  const client = getOpenAIClient();

  if (!text || text.trim().length === 0) {
    throw new Error("Text cannot be empty");
  }

  try {
    const response = await client.embeddings.create({
      model: model,
      input: text.trim(),
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    // Provide more helpful error message for authentication errors
    if (error.code === "invalid_api_key" || error.status === 401) {
      throw new Error("Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.");
    }
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple text chunks in batch
 * @param {Array<string>} texts - Array of texts to embed
 * @param {Object} options - Options for embedding generation
 * @param {string} options.model - Embedding model to use (default: 'text-embedding-3-small')
 * @return {Promise<Array<Array<number>>>} Array of embedding vectors
 */
async function generateEmbeddingsBatch(texts, options = {}) {
  const {model = "text-embedding-3-small"} = options;

  const client = getOpenAIClient();

  if (!texts || texts.length === 0) {
    return [];
  }

  // Filter out empty texts
  const validTexts = texts.filter((t) => t && t.trim().length > 0);

  if (validTexts.length === 0) {
    return [];
  }

  try {
    // OpenAI API supports batch requests
    const response = await client.embeddings.create({
      model: model,
      input: validTexts.map((t) => t.trim()),
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error("Error generating embeddings batch:", error);
    // Provide more helpful error message for authentication errors
    if (error.code === "invalid_api_key" || error.status === 401) {
      throw new Error("Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.");
    }
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Array<number>} vec1 - First vector
 * @param {Array<number>} vec2 - Second vector
 * @return {number} Cosine similarity score (-1 to 1)
 */
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

module.exports = {
  initializeOpenAI,
  getOpenAIClient,
  getDeepSeekClient,
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
};


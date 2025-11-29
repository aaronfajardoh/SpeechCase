/**
 * Embedding service using OpenAI API and Deep Seek API
 * Generates vector embeddings for text chunks
 */

import OpenAI from 'openai';

let openaiClient = null;
let deepSeekClient = null;

/**
 * Initialize OpenAI client
 * @param {string} apiKey - OpenAI API key
 */
export function initializeOpenAI(apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }
  openaiClient = new OpenAI({ apiKey });
}

/**
 * Initialize Deep Seek client
 * @param {string} apiKey - Deep Seek API key
 */
export function initializeDeepSeek(apiKey) {
  if (!apiKey) {
    throw new Error('Deep Seek API key is required');
  }
  // Deep Seek uses OpenAI-compatible API with different base URL
  deepSeekClient = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1'
  });
}

/**
 * Generate embeddings for a single text chunk
 * @param {string} text - Text to embed
 * @param {Object} options - Options for embedding generation
 * @param {string} options.model - Embedding model to use (default: 'text-embedding-3-small')
 * @param {boolean} options.useDeepSeek - Use Deep Seek instead of OpenAI (default: false)
 * @returns {Promise<Array<number>>} Embedding vector
 */
export async function generateEmbedding(text, options = {}) {
  const { model = 'text-embedding-3-small', useDeepSeek = false } = options;
  
  const client = useDeepSeek ? deepSeekClient : openaiClient;
  
  if (!client) {
    const serviceName = useDeepSeek ? 'Deep Seek' : 'OpenAI';
    throw new Error(`${serviceName} client not initialized. Call initialize${useDeepSeek ? 'DeepSeek' : 'OpenAI'} first.`);
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  try {
    // Deep Seek may not support embeddings - try OpenAI-compatible model first
    // If Deep Seek doesn't work, we'll fall back to OpenAI
    let embeddingModel = model;
    if (useDeepSeek) {
      // Try Deep Seek's embedding model (if available) or fall back to OpenAI model
      embeddingModel = 'text-embedding'; // Deep Seek might use this
    }
    
    const response = await client.embeddings.create({
      model: embeddingModel,
      input: text.trim(),
    });

    return response.data[0].embedding;
  } catch (error) {
    // If Deep Seek fails and we were trying to use it, fall back to OpenAI
    if (useDeepSeek && deepSeekClient && openaiClient) {
      console.warn('Deep Seek embedding failed, falling back to OpenAI');
      try {
        const response = await openaiClient.embeddings.create({
          model: model,
          input: text.trim(),
        });
        return response.data[0].embedding;
      } catch (fallbackError) {
        console.error('Error generating embedding with fallback:', fallbackError);
        throw new Error(`Failed to generate embedding: ${fallbackError.message}`);
      }
    }
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple text chunks in batch
 * @param {Array<string>} texts - Array of texts to embed
 * @param {Object} options - Options for embedding generation
 * @param {string} options.model - Embedding model to use (default: 'text-embedding-3-small')
 * @param {boolean} options.useDeepSeek - Use Deep Seek instead of OpenAI (default: false)
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts, options = {}) {
  const { model = 'text-embedding-3-small', useDeepSeek = false } = options;
  
  const client = useDeepSeek ? deepSeekClient : openaiClient;
  
  if (!client) {
    const serviceName = useDeepSeek ? 'Deep Seek' : 'OpenAI';
    throw new Error(`${serviceName} client not initialized. Call initialize${useDeepSeek ? 'DeepSeek' : 'OpenAI'} first.`);
  }

  if (!texts || texts.length === 0) {
    return [];
  }

  // Filter out empty texts
  const validTexts = texts.filter(t => t && t.trim().length > 0);
  
  if (validTexts.length === 0) {
    return [];
  }

  try {
    // Deep Seek may not support embeddings - try OpenAI-compatible model first
    let embeddingModel = model;
    if (useDeepSeek) {
      embeddingModel = 'text-embedding'; // Deep Seek might use this
    }
    
    // OpenAI/Deep Seek API supports batch requests
    const response = await client.embeddings.create({
      model: embeddingModel,
      input: validTexts.map(t => t.trim()),
    });

    return response.data.map(item => item.embedding);
  } catch (error) {
    // If Deep Seek fails and we were trying to use it, fall back to OpenAI
    if (useDeepSeek && deepSeekClient && openaiClient) {
      console.warn('Deep Seek embeddings batch failed, falling back to OpenAI');
      try {
        const response = await openaiClient.embeddings.create({
          model: model,
          input: validTexts.map(t => t.trim()),
        });
        return response.data.map(item => item.embedding);
      } catch (fallbackError) {
        console.error('Error generating embeddings batch with fallback:', fallbackError);
        // Provide more helpful error message for authentication errors
        if (fallbackError.code === 'invalid_api_key' || fallbackError.status === 401) {
          throw new Error(`Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.`);
        }
        throw new Error(`Failed to generate embeddings: ${fallbackError.message}`);
      }
    }
    console.error('Error generating embeddings batch:', error);
    // Provide more helpful error message for authentication errors
    if (error.code === 'invalid_api_key' || error.status === 401) {
      throw new Error(`Invalid API key. Please check your API key configuration.`);
    }
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Array<number>} vec1 - First vector
 * @param {Array<number>} vec2 - Second vector
 * @returns {number} Cosine similarity score (-1 to 1)
 */
export function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
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


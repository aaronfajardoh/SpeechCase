/**
 * Firebase Cloud Functions
 * Migrated from Express server to Firebase Callable Functions
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for all functions
setGlobalOptions({
  maxInstances: 10,
  region: "us-central1",
});

// Note: OPENAI_API_KEY should be set as a Firebase secret using:
// echo -n "your-key" | firebase functions:secrets:set OPENAI_API_KEY
// The secret will be available in process.env.OPENAI_API_KEY at runtime

// Import services
const vectorStore = require("./src/vectorStore");
const {generateEmbedding, generateEmbeddingsBatch} = require("./src/embeddings");
const {chunkText, addMetadataTags} = require("./src/chunking");
const prompts = require("./src/prompts");
const {getOpenAIClient} = require("./src/embeddings");
const textToSpeech = require("@google-cloud/text-to-speech");
const {getCharacterImagesBatch} = require("./src/imageService");

// Initialize Firestore
const db = admin.firestore();

// Initialize Google Cloud Text-to-Speech client
const ttsClient = new textToSpeech.TextToSpeechClient();

/**
 * Process PDF: Chunk text, generate embeddings, and store in Firestore
 * @param {Object} data - Request data
 * @param {string} data.documentId - Document ID
 * @param {string} data.text - Text content to process
 * @param {Object} data.metadata - Optional document metadata
 * @param {Object} context - Firebase callable context (includes auth)
 * @returns {Promise<Object>} Success response
 */
exports.processPdf = onCall(
    {
      secrets: ["OPENAI_API_KEY"],
    },
    async (request) => {
      try {
        const {documentId, text, metadata = {}} = request.data;
        const uid = request.auth && request.auth.uid;

        if (!uid) {
          throw new HttpsError("unauthenticated", "User must be authenticated");
        }

        if (!documentId || !text) {
          throw new HttpsError("invalid-argument", "documentId and text are required");
        }

        logger.info(`Processing PDF for user ${uid}, document ${documentId}`);

        // Chunk the text
        const chunks = chunkText(text, {
          chunkSize: 1000,
          chunkOverlap: 200,
          minChunkSize: 100,
        });

        // Add metadata tags
        const taggedChunks = addMetadataTags(chunks, text);

        // Generate embeddings for all chunks in batch
        const texts = taggedChunks.map((chunk) => chunk.text);
        let embeddings;
        try {
          embeddings = await generateEmbeddingsBatch(texts);
        } catch (embedError) {
          logger.error("Error generating embeddings:", embedError);
          if (embedError.message && embedError.message.includes("API key")) {
            throw new HttpsError("failed-precondition", "Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.");
          }
          throw new HttpsError("internal", `Failed to generate embeddings: ${embedError.message}`);
        }

        // Attach embeddings to chunks
        const chunksWithEmbeddings = taggedChunks.map((chunk, index) => ({
          ...chunk,
          embedding: embeddings[index],
        }));

        // Store in Firestore vector store
        await vectorStore.storeDocument(uid, documentId, {
          ...metadata,
          textLength: text.length,
          processedAt: new Date().toISOString(),
        }, chunksWithEmbeddings);

        logger.info(`Successfully processed ${chunksWithEmbeddings.length} chunks for document ${documentId}`);

        return {
          success: true,
          documentId,
          chunkCount: chunksWithEmbeddings.length,
          message: "PDF processed and stored successfully",
        };
      } catch (error) {
        logger.error("Error processing PDF:", error);
        // If it's already an HttpsError, re-throw it
        if (error instanceof HttpsError) {
          throw error;
        }
        // Otherwise, wrap it in an HttpsError
        throw new HttpsError("internal", `Failed to process PDF: ${error.message}`);
      }
    },
);

/**
 * Ask Question: Answer questions about documents using RAG
 * @param {Object} data - Request data
 * @param {string} data.question - Question to answer
 * @param {string} data.documentId - Document ID to search
 * @param {number} data.topK - Number of top chunks to retrieve (default: 5)
 * @param {Object} context - Firebase callable context (includes auth)
 * @returns {Promise<Object>} Answer with sources
 */
exports.askQuestion = onCall(
    {
      secrets: ["OPENAI_API_KEY"],
    },
    async (request) => {
      try {
        const {question, documentId, topK = 5} = request.data;
        const uid = request.auth && request.auth.uid;

        if (!uid) {
          throw new HttpsError("unauthenticated", "User must be authenticated");
        }

        if (!question || !documentId) {
          throw new HttpsError("invalid-argument", "question and documentId are required");
        }

        logger.info(`Answering question for user ${uid}, document ${documentId}`);

        // Get document to verify it exists
        const document = await vectorStore.getDocument(uid, documentId);
        if (!document) {
          throw new HttpsError("not-found", "Document not found. Please process the PDF first.");
        }

        // Generate embedding for the question
        const questionEmbedding = await generateEmbedding(question);

        // Find relevant chunks using Firestore vector search
        const relevantChunks = await vectorStore.searchSimilar(uid, questionEmbedding, {
          documentId,
          topK,
          minScore: 0.3, // Minimum similarity threshold
        });

        if (relevantChunks.length === 0) {
          return {
            answer: "I couldn't find relevant information in the document to answer this question.",
            sources: [],
          };
        }

        // Build context from relevant chunks
        const context = relevantChunks
            .map((chunk, index) => `[${index + 1}] ${chunk.text}`)
            .join("\n\n");

        // Use OpenAI to generate answer based on context
        const openaiClient = getOpenAIClient();
        const completion = await openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: prompts.qaSystemPrompt,
            },
            {
              role: "user",
              content: `Context from document:\n\n${context}\n\nQuestion: ${question}\n\nAnswer the question based only on the context provided above.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });

        const answer = completion.choices[0].message.content;

        logger.info(`Successfully answered question for document ${documentId}`);

        return {
          answer,
          sources: relevantChunks.map((chunk) => ({
            text: chunk.text.substring(0, 200) + "...",
            similarity: chunk.similarity,
            chunkIndex: chunk.chunkIndex,
          })),
        };
      } catch (error) {
        logger.error("Error in Q&A:", error);
        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", `Failed to answer question: ${error.message}`);
      }
    },
);

/**
 * Helper function to get full text from document chunks
 * @param {string} uid - User ID
 * @param {string} documentId - Document ID
 * @return {Promise<string>} Full text content
 */
async function getDocumentFullText(uid, documentId) {
  const chunks = await vectorStore.getDocumentChunks(uid, documentId);
  if (chunks.length === 0) {
    return "";
  }
  // Sort by chunkIndex to ensure correct order
  chunks.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
  return chunks.map((chunk) => chunk.text).join("\n\n");
}

/**
 * Generate Timeline: Extract chronological timeline from document
 * @param {Object} data - Request data
 * @param {string} data.documentId - Document ID
 * @param {Object} context - Firebase callable context (includes auth)
 * @return {Promise<Object>} Timeline data
 */
exports.generateTimeline = onCall(
    {
      secrets: ["OPENAI_API_KEY"],
    },
    async (request) => {
      try {
        const {documentId} = request.data;
        const uid = request.auth && request.auth.uid;

        if (!uid) {
          throw new HttpsError("unauthenticated", "User must be authenticated");
        }

        if (!documentId) {
          throw new HttpsError("invalid-argument", "documentId is required");
        }

        logger.info(`Generating timeline for user ${uid}, document ${documentId}`);

        // Verify document exists
        const document = await vectorStore.getDocument(uid, documentId);
        if (!document) {
          throw new HttpsError("not-found", "Document not found. Please process the PDF first.");
        }

        // Get full text from chunks
        const fullText = await getDocumentFullText(uid, documentId);
        if (!fullText || fullText.trim().length === 0) {
          throw new HttpsError("failed-precondition", "Document has no text content.");
        }

        // Generate timeline using OpenAI
        const openaiClient = getOpenAIClient();
        const completion = await openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: prompts.timelineSystemPrompt,
            },
            {
              role: "user",
              content: prompts.timelineUserPrompt(fullText),
            },
          ],
          temperature: 0.7,
          response_format: {type: "json_object"},
        });

        const responseContent = completion.choices[0].message.content;
        let timelineData;
        try {
          timelineData = JSON.parse(responseContent);
        } catch (parseError) {
          logger.error("Failed to parse timeline JSON:", parseError);
          throw new HttpsError("internal", "Failed to parse timeline response from AI.");
        }

        // Save timeline to Firestore document
        const docRef = db.collection("users").doc(uid)
            .collection("documents").doc(documentId);
        await docRef.set({
          timeline: timelineData.timeline || [],
          timelineGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});

        logger.info(`Successfully generated timeline for document ${documentId}`);

        return {
          success: true,
          timeline: timelineData.timeline || [],
        };
      } catch (error) {
        logger.error("Error generating timeline:", error);
        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", `Failed to generate timeline: ${error.message}`);
      }
    },
);

/**
 * Generate Characters: Extract character information from document
 * @param {Object} data - Request data
 * @param {string} data.documentId - Document ID
 * @param {Object} context - Firebase callable context (includes auth)
 * @return {Promise<Object>} Characters data
 */
exports.generateCharacters = onCall(
    {
      secrets: [
        "OPENAI_API_KEY",
        "GOOGLE_SEARCH_API_KEY",
        "GOOGLE_SEARCH_ENGINE_ID",
        "GOOGLE_AI_KEY",
      ], // Google API keys are optional - function works without them (no images)
    },
    async (request) => {
      try {
        const {documentId} = request.data;
        const uid = request.auth && request.auth.uid;

        if (!uid) {
          throw new HttpsError("unauthenticated", "User must be authenticated");
        }

        if (!documentId) {
          throw new HttpsError("invalid-argument", "documentId is required");
        }

        logger.info(`Generating characters for user ${uid}, document ${documentId}`);

        // Verify document exists
        const document = await vectorStore.getDocument(uid, documentId);
        if (!document) {
          throw new HttpsError("not-found", "Document not found. Please process the PDF first.");
        }

        // Get full text from chunks
        const fullText = await getDocumentFullText(uid, documentId);
        if (!fullText || fullText.trim().length === 0) {
          throw new HttpsError("failed-precondition", "Document has no text content.");
        }

        // Generate characters using OpenAI
        const openaiClient = getOpenAIClient();
        const completion = await openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: prompts.charactersSystemPrompt,
            },
            {
              role: "user",
              content: prompts.charactersUserPrompt(fullText),
            },
          ],
          temperature: 0.7,
          response_format: {type: "json_object"},
        });

        const responseContent = completion.choices[0].message.content;
        let charactersData;
        try {
          charactersData = JSON.parse(responseContent);
        } catch (parseError) {
          logger.error("Failed to parse characters JSON:", parseError);
          throw new HttpsError("internal", "Failed to parse characters response from AI.");
        }

        // Get images for characters (optional - only if API keys are configured)
        const googleSearchApiKey = process.env.GOOGLE_SEARCH_API_KEY;
        const googleSearchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
        const googleAiKey = process.env.GOOGLE_AI_KEY;

        let charactersWithImages = charactersData.characters || [];
        if ((googleSearchApiKey && googleSearchEngineId) || googleAiKey) {
          try {
            logger.info(`Fetching images for ${charactersWithImages.length} characters`);
            charactersWithImages = await getCharacterImagesBatch(charactersWithImages, {
              googleSearchApiKey,
              googleSearchEngineId,
              googleAiKey,
            });
            logger.info(`Successfully fetched images for characters`);
          } catch (imageError) {
            logger.warn("Error fetching character images, continuing without images:", imageError);
            // Continue without images if image fetching fails
          }
        }

        // Save characters to Firestore subcollection to avoid document size limits
        // Store metadata in main document, characters in subcollection
        const docRef = db.collection("users").doc(uid)
            .collection("documents").doc(documentId);
        const charactersRef = docRef.collection("characters");

        // Update main document with metadata only
        await docRef.set({
          isOrgChart: charactersData.isOrgChart || false,
          characterCount: charactersWithImages.length,
          charactersGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});

        // Delete existing characters before storing new ones
        const existingCharacters = await charactersRef.get();
        const deleteBatchSize = 50;
        for (let i = 0; i < existingCharacters.docs.length; i += deleteBatchSize) {
          const batch = db.batch();
          const deleteBatch = existingCharacters.docs.slice(i, i + deleteBatchSize);
          deleteBatch.forEach((doc) => {
            batch.delete(doc.ref);
          });
          if (deleteBatch.length > 0) {
            await batch.commit();
          }
        }

        // Store characters in subcollection (each character is its own document)
        const writeBatchSize = 10; // Small batches to avoid transaction limits
        for (let i = 0; i < charactersWithImages.length; i += writeBatchSize) {
          const batch = db.batch();
          const characterBatch = charactersWithImages.slice(i, i + writeBatchSize);
          characterBatch.forEach((character, index) => {
            const characterId = `character_${i + index}`;
            const characterRef = charactersRef.doc(characterId);
            batch.set(characterRef, {
              ...character,
              characterIndex: i + index,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          });
          await batch.commit();
        }

        logger.info(`Successfully generated ${charactersWithImages.length} characters for document ${documentId}`);

        return {
          success: true,
          characters: charactersWithImages,
          isOrgChart: charactersData.isOrgChart || false,
        };
      } catch (error) {
        logger.error("Error generating characters:", error);
        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", `Failed to generate characters: ${error.message}`);
      }
    },
);

/**
 * Generate Summary: Create summary from document highlights
 * @param {Object} data - Request data
 * @param {string} data.documentId - Document ID
 * @param {string} data.highlights - Optional highlights text (if not provided, uses full text)
 * @param {Object} context - Firebase callable context (includes auth)
 * @return {Promise<Object>} Summary data
 */
exports.generateSummary = onCall(
    {
      secrets: ["OPENAI_API_KEY"],
    },
    async (request) => {
      try {
        const {documentId, highlights} = request.data;
        const uid = request.auth && request.auth.uid;

        if (!uid) {
          throw new HttpsError("unauthenticated", "User must be authenticated");
        }

        if (!documentId) {
          throw new HttpsError("invalid-argument", "documentId is required");
        }

        logger.info(`Generating summary for user ${uid}, document ${documentId}`);

        // Verify document exists
        const document = await vectorStore.getDocument(uid, documentId);
        if (!document) {
          throw new HttpsError("not-found", "Document not found. Please process the PDF first.");
        }

        // Use provided highlights or get full text from chunks
        let contentToSummarize = highlights;
        if (!contentToSummarize || contentToSummarize.trim().length === 0) {
          contentToSummarize = await getDocumentFullText(uid, documentId);
        }

        if (!contentToSummarize || contentToSummarize.trim().length === 0) {
          throw new HttpsError("failed-precondition", "No content available to summarize.");
        }

        // Generate summary using OpenAI
        const openaiClient = getOpenAIClient();
        const completion = await openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: prompts.summarySystemPrompt,
            },
            {
              role: "user",
              content: prompts.summaryUserPrompt(contentToSummarize),
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        });

        const summary = completion.choices[0].message.content;

        // Save summary to Firestore document
        const docRef = db.collection("users").doc(uid)
            .collection("documents").doc(documentId);
        await docRef.set({
          summary: summary,
          summaryGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});

        logger.info(`Successfully generated summary for document ${documentId}`);

        return {
          success: true,
          summary: summary,
        };
      } catch (error) {
        logger.error("Error generating summary:", error);
        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", `Failed to generate summary: ${error.message}`);
      }
    },
);

/**
 * Generate TTS: Convert text to speech using Google Cloud Text-to-Speech
 * @param {Object} data - Request data
 * @param {string} data.text - Text to convert to speech
 * @param {string} data.voiceId - Optional voice ID (default: "en-US-Standard-C")
 * @param {Object} context - Firebase callable context (includes auth)
 * @return {Promise<Object>} Audio data in base64
 */
exports.generateTts = onCall(async (request) => {
  try {
    const {text, voiceId = "en-US-Standard-C"} = request.data;
    const uid = request.auth && request.auth.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    if (!text || text.trim().length === 0) {
      throw new HttpsError("invalid-argument", "text is required");
    }

    logger.info(`Generating TTS for user ${uid}, text length: ${text.length}`);

    // Prepare the request for Google Cloud Text-to-Speech
    const requestTts = {
      input: {text: text.trim()},
      voice: {
        languageCode: voiceId.split("-").slice(0, 2).join("-") || "en-US",
        name: voiceId,
        ssmlGender: "NEUTRAL",
      },
      audioConfig: {
        audioEncoding: "MP3",
      },
    };

    // Generate speech
    const [response] = await ttsClient.synthesizeSpeech(requestTts);

    if (!response.audioContent) {
      throw new HttpsError("internal", "Failed to generate audio content.");
    }

    // Convert audio buffer to base64
    const audioBase64 = response.audioContent.toString("base64");

    logger.info(`Successfully generated TTS audio, size: ${audioBase64.length} bytes`);

    return {
      audioContent: audioBase64,
      mimeType: "audio/mp3",
    };
  } catch (error) {
    logger.error("Error generating TTS:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", `Failed to generate TTS: ${error.message}`);
  }
});

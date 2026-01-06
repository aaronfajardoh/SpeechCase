/**
 * Firestore-based Vector Store
 * Replaces in-memory vector store with Firestore persistence
 * Structure: users/{uid}/documents/{docId}/chunks/{chunkId}
 */

const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Calculate cosine similarity between two vectors
 * @param {Array<number>} a - First vector
 * @param {Array<number>} b - Second vector
 * @return {number} Cosine similarity score (0 to 1)
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Firestore Vector Store implementation
 */
const vectorStore = {
  /**
   * Store a document and its chunks in Firestore
   * @param {string} uid - User ID
   * @param {string} documentId - Document ID
   * @param {Object} metadata - Document metadata
   * @param {Array<Object>} chunks - Array of chunk objects
   * @return {Promise<void>}
   */
  async storeDocument(uid, documentId, metadata, chunks) {
    if (!uid || !documentId) {
      throw new Error("uid and documentId are required");
    }

    const docRef = db.collection("users").doc(uid)
        .collection("documents").doc(documentId);
    const chunksRef = docRef.collection("chunks");

    // Store document metadata
    await docRef.set({
      ...metadata,
      textLength: metadata.textLength || 0,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      chunkCount: chunks.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    // Delete existing chunks in batches
    // Use smaller batch size to avoid transaction size limits
    const existingChunks = await chunksRef.get();
    const deleteBatchSize = 50; // Further reduced to handle large documents
    for (let i = 0; i < existingChunks.docs.length; i += deleteBatchSize) {
      const batch = db.batch();
      const deleteBatch = existingChunks.docs.slice(i, i + deleteBatchSize);
      deleteBatch.forEach((doc) => {
        batch.delete(doc.ref);
      });
      if (deleteBatch.length > 0) {
        await batch.commit();
      }
    }

    // Store chunks in very small batches
    // Firestore transaction size limit is ~10MB
    // Each chunk: text (~1KB) + embedding (~6KB) + metadata (~1KB) = ~8KB per chunk
    // To stay well under 10MB limit, use 10 chunks per batch (80KB per batch)
    const batchSize = 10; // Very small batch to avoid transaction size limits
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = db.batch();
      const chunkBatch = chunks.slice(i, i + batchSize);

      chunkBatch.forEach((chunk, index) => {
        const chunkId = `chunk_${i + index}`;
        const chunkRef = chunksRef.doc(chunkId);

        // Ensure embedding is an array (safety check)
        const embedding = Array.isArray(chunk.embedding) ? chunk.embedding : [];

        // Estimate document size to avoid exceeding 1MB per document limit
        const textSize = chunk.text ? chunk.text.length : 0;
        const embeddingSize = embedding.length * 4; // 4 bytes per float
        const estimatedSize = textSize + embeddingSize + 1000; // +1KB for metadata overhead

        // If a single chunk is too large, truncate text (keep embedding intact)
        let textToStore = chunk.text;
        if (estimatedSize > 900000) { // 900KB threshold to stay under 1MB
          const maxTextSize = 900000 - embeddingSize - 1000;
          textToStore = chunk.text.substring(0, Math.max(0, maxTextSize));
        }

        batch.set(chunkRef, {
          text: textToStore,
          embedding: embedding,
          metadata: chunk.metadata || {},
          tags: chunk.tags || [],
          chunkIndex: i + index,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
    }
  },

  /**
   * Retrieve document metadata
   * @param {string} uid - User ID
   * @param {string} documentId - Document ID
   * @return {Promise<Object|null>} Document metadata or null if not found
   */
  async getDocument(uid, documentId) {
    if (!uid || !documentId) {
      return null;
    }

    const docRef = db.collection("users").doc(uid)
        .collection("documents").doc(documentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    return {id: doc.id, ...doc.data()};
  },

  /**
   * Retrieve all chunks for a document
   * @param {string} uid - User ID
   * @param {string} documentId - Document ID
   * @return {Promise<Array<Object>>} Array of chunk objects
   */
  async getDocumentChunks(uid, documentId) {
    if (!uid || !documentId) {
      return [];
    }

    const chunksRef = db.collection("users").doc(uid)
        .collection("documents").doc(documentId)
        .collection("chunks");

    const snapshot = await chunksRef.orderBy("chunkIndex").get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  },

  /**
   * Delete a document and all its chunks
   * @param {string} uid - User ID
   * @param {string} documentId - Document ID
   * @return {Promise<void>}
   */
  async deleteDocument(uid, documentId) {
    if (!uid || !documentId) {
      return;
    }

    const docRef = db.collection("users").doc(uid)
        .collection("documents").doc(documentId);
    const chunksRef = docRef.collection("chunks");

    // Delete chunks in batches (reduced size to avoid transaction limits)
    const chunksSnapshot = await chunksRef.get();
    const batchSize = 100; // Reduced from 500 to handle large documents
    for (let i = 0; i < chunksSnapshot.docs.length; i += batchSize) {
      const batch = db.batch();
      const deleteBatch = chunksSnapshot.docs.slice(i, i + batchSize);
      deleteBatch.forEach((doc) => {
        batch.delete(doc.ref);
      });
      if (deleteBatch.length > 0) {
        await batch.commit();
      }
    }

    // Delete document
    await docRef.delete();
  },

  /**
   * Search for similar chunks using cosine similarity
   * @param {string} uid - User ID
   * @param {Array<number>} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @param {string} options.documentId - Document ID to search within (optional)
   * @param {number} options.topK - Number of top results to return (default: 5)
   * @param {number} options.minScore - Minimum similarity score (default: 0)
   * @param {Array<string>} options.tags - Tags to filter by (optional)
   * @return {Promise<Array<Object>>} Array of similar chunks with similarity scores
   */
  async searchSimilar(uid, queryEmbedding, options = {}) {
    const {
      documentId,
      topK = 5,
      minScore = 0,
      tags = [],
    } = options;

    if (!uid || !queryEmbedding || !Array.isArray(queryEmbedding)) {
      return [];
    }

    const results = [];

    // If documentId is specified, search only that document
    if (documentId) {
      const chunks = await this.getDocumentChunks(uid, documentId);

      for (const chunk of chunks) {
        const embedding = chunk.embedding;
        if (!embedding || !Array.isArray(embedding)) continue;

        // Optional tag filtering
        if (Array.isArray(tags) && tags.length > 0) {
          const chunkTags = Array.isArray(chunk.tags) ? chunk.tags : [];
          const hasAllTags = tags.every((tag) => chunkTags.includes(tag));
          if (!hasAllTags) continue;
        }

        const similarity = cosineSimilarity(queryEmbedding, embedding);
        if (similarity >= minScore) {
          results.push({
            ...chunk,
            similarity,
            documentId,
          });
        }
      }
    } else {
      // Search across all user documents
      const documentsRef = db.collection("users").doc(uid)
          .collection("documents");
      const documentsSnapshot = await documentsRef.get();

      for (const doc of documentsSnapshot.docs) {
        const chunks = await this.getDocumentChunks(uid, doc.id);

        for (const chunk of chunks) {
          const embedding = chunk.embedding;
          if (!embedding || !Array.isArray(embedding)) continue;

          // Optional tag filtering
          if (Array.isArray(tags) && tags.length > 0) {
            const chunkTags = Array.isArray(chunk.tags) ? chunk.tags : [];
            const hasAllTags = tags.every((tag) => chunkTags.includes(tag));
            if (!hasAllTags) continue;
          }

          const similarity = cosineSimilarity(queryEmbedding, embedding);
          if (similarity >= minScore) {
            results.push({
              ...chunk,
              similarity,
              documentId: doc.id,
            });
          }
        }
      }
    }

    // Sort by similarity descending and take topK
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  },

  /**
   * Get statistics about stored documents
   * @param {string} uid - User ID
   * @return {Promise<Object>} Statistics object
   */
  async getStats(uid) {
    if (!uid) {
      return {documentCount: 0, totalChunks: 0};
    }

    const documentsRef = db.collection("users").doc(uid)
        .collection("documents");
    const documentsSnapshot = await documentsRef.get();

    let totalChunks = 0;
    for (const doc of documentsSnapshot.docs) {
      const chunksRef = doc.ref.collection("chunks");
      const chunksSnapshot = await chunksRef.count().get();
      totalChunks += chunksSnapshot.data().count;
    }

    return {
      documentCount: documentsSnapshot.size,
      totalChunks,
    };
  },
};

module.exports = vectorStore;


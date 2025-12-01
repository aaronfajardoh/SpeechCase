// Simple in-memory vector store for documents and their chunks
// This implementation is designed to support the endpoints used in server.js.

const documents = new Map(); // documentId -> metadata
const documentChunks = new Map(); // documentId -> [chunks]

export const vectorStore = {
  // Store a document and its chunks
  storeDocument(documentId, metadata, chunks) {
    documents.set(documentId, metadata || {});
    documentChunks.set(documentId, Array.isArray(chunks) ? chunks : []);
  },

  // Retrieve document metadata
  getDocument(documentId) {
    return documents.get(documentId) || null;
  },

  // Retrieve all chunks for a document
  getDocumentChunks(documentId) {
    return documentChunks.get(documentId) || [];
  },

  // Delete a document and its chunks
  deleteDocument(documentId) {
    documents.delete(documentId);
    documentChunks.delete(documentId);
  },

  // Basic cosine similarity between two vectors
  _cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
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
  },

  // Search for similar chunks using cosine similarity
  // options: { documentId?, topK = 5, minScore = 0, tags = [] }
  searchSimilar(queryEmbedding, options = {}) {
    const {
      documentId,
      topK = 5,
      minScore = 0,
      tags = []
    } = options;

    const results = [];

    const docIds = documentId ? [documentId] : Array.from(documentChunks.keys());

    for (const id of docIds) {
      const chunks = documentChunks.get(id) || [];
      chunks.forEach((chunk, index) => {
        const embedding = chunk.embedding;
        if (!embedding || !Array.isArray(embedding)) return;

        // Optional tag filtering
        if (Array.isArray(tags) && tags.length > 0) {
          const chunkTags = Array.isArray(chunk.tags) ? chunk.tags : [];
          const hasAllTags = tags.every(tag => chunkTags.includes(tag));
          if (!hasAllTags) return;
        }

        const similarity = this._cosineSimilarity(queryEmbedding, embedding);
        if (similarity >= minScore) {
          results.push({
            ...chunk,
            similarity,
            chunkIndex: index,
            documentId: id
          });
        }
      });
    }

    // Sort by similarity descending and take topK
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  },

  // Basic stats for debugging/inspection
  getStats() {
    let totalChunks = 0;
    for (const chunks of documentChunks.values()) {
      totalChunks += chunks.length;
    }

    return {
      documentCount: documents.size,
      totalChunks
    };
  }
};




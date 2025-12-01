import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import textToSpeech from '@google-cloud/text-to-speech';
import { chunkText, addMetadataTags } from './services/chunking.js';
import { initializeOpenAI, initializeDeepSeek, generateEmbedding, generateEmbeddingsBatch } from './services/embeddings.js';
import { vectorStore } from './services/vectorStore.js';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON bodies
app.use(express.json({ limit: '10mb' }));

// Initialize Google Cloud TTS client
// On Heroku, use GOOGLE_APPLICATION_CREDENTIALS env var or GOOGLE_CREDENTIALS JSON string
// For local development, fall back to keyFilename if env vars are not set
let clientConfig = {};

if (process.env.GOOGLE_CREDENTIALS) {
  // If credentials are provided as a JSON string in environment variable
  try {
    clientConfig.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  } catch (error) {
    console.error('Error parsing GOOGLE_CREDENTIALS:', error);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // If path to credentials file is provided
  clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
} else {
  // Fall back to local file (for development)
  const keyFile = join(__dirname, 'speechcase-1ff2439d1c93.json');
  if (existsSync(keyFile)) {
    clientConfig.keyFilename = keyFile;
  } else {
    console.warn('No Google Cloud credentials found. TTS functionality will not work.');
  }
}

const client = new textToSpeech.TextToSpeechClient(clientConfig);

// Initialize AI clients for embeddings and chat
let openaiClient = null;
let deepSeekClient = null;

// Initialize Deep Seek (preferred for chat completions - cheaper)
if (process.env.DEEPSEEK_API_KEY) {
  try {
    initializeDeepSeek(process.env.DEEPSEEK_API_KEY);
    deepSeekClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1'
    });
    console.log('Deep Seek client initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize Deep Seek client:', error.message);
  }
} else {
  console.warn('DEEPSEEK_API_KEY not found. Will use OpenAI for chat if available.');
}

// Initialize OpenAI (for chat completions and fallback)
if (process.env.OPENAI_API_KEY) {
  try {
    initializeOpenAI(process.env.OPENAI_API_KEY);
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('OpenAI client initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize OpenAI client:', error.message);
  }
} else {
  console.warn('OPENAI_API_KEY not found. Some AI features may not be available.');
}

// Helper function to split text into chunks under 5000 bytes
function splitTextIntoChunks(text, maxBytes = 4500) {
  const chunks = [];
  let currentChunk = '';
  let currentBytes = 0;

  // Split by sentences first, then by words if needed
  const sentences = text.match(/[^.!?]+[.!?]+[\])'"`'"]*|.+/g) || [text];

  for (const sentence of sentences) {
    const sentenceBytes = Buffer.byteLength(sentence, 'utf8');

    // If a single sentence is too long, split by words
    if (sentenceBytes > maxBytes) {
      const words = sentence.split(/(\s+)/);
      for (const word of words) {
        const wordBytes = Buffer.byteLength(word, 'utf8');
        
        if (currentBytes + wordBytes > maxBytes && currentChunk) {
          chunks.push(currentChunk);
          currentChunk = word;
          currentBytes = wordBytes;
        } else {
          currentChunk += word;
          currentBytes += wordBytes;
        }
      }
    } else {
      // If adding this sentence would exceed the limit, save current chunk
      if (currentBytes + sentenceBytes > maxBytes && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
        currentBytes = sentenceBytes;
      } else {
        currentChunk += sentence;
        currentBytes += sentenceBytes;
      }
    }
  }

  // Add the last chunk if it exists
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Endpoint to get text chunks (for streaming)
app.post('/api/tts/chunks', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }
    const textBytes = Buffer.byteLength(text, 'utf8');
    const maxBytes = 4500;
    
    if (textBytes <= maxBytes) {
      return res.json({ chunks: [text] });
    }
    
    const chunks = splitTextIntoChunks(text, maxBytes);
    res.json({ chunks });
  } catch (error) {
    console.error('Error splitting text:', error);
    res.status(500).json({ error: 'Failed to split text', details: error.message });
  }
});

// Google TTS endpoint for Spanish text
app.post('/api/tts', async (req, res) => {
  try {
    const { text, rate = 1.0 } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Check if text exceeds 5000 bytes
    const textBytes = Buffer.byteLength(text, 'utf8');
    const maxBytes = 4500; // Use 4500 to be safe (under 5000 limit)

    if (textBytes <= maxBytes) {
      // Text is small enough, process normally
      const request = {
        input: { text },
        voice: {
          languageCode: 'es-US',
          name: 'es-US-Neural2-B',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: rate,
          pitch: 0.0,
          volumeGainDb: 0.0,
        },
      };

      const [response] = await client.synthesizeSpeech(request);
      const audioContent = response.audioContent;

      res.json({
        audioContent: audioContent.toString('base64'),
        mimeType: 'audio/mpeg',
      });
    } else {
      // Text is too long, split into chunks
      console.log(`Text is ${textBytes} bytes, splitting into chunks...`);
      const chunks = splitTextIntoChunks(text, maxBytes);
      console.log(`Split into ${chunks.length} chunks`);

      const audioChunks = [];

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i].trim();
        if (!chunk) continue;

        const request = {
          input: { text: chunk },
          voice: {
            languageCode: 'es-US',
            name: 'es-US-Neural2-B',
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: rate,
            pitch: 0.0,
            volumeGainDb: 0.0,
          },
        };

        const [response] = await client.synthesizeSpeech(request);
        audioChunks.push(response.audioContent.toString('base64'));
      }

      // Return array of audio chunks
      res.json({
        audioChunks: audioChunks,
        mimeType: 'audio/mpeg',
      });
    }
  } catch (error) {
    console.error('Error with Google TTS:', error);
    res.status(500).json({ error: 'Failed to generate speech', details: error.message });
  }
});

// ============================================================================
// AI Features API Endpoints
// ============================================================================

/**
 * Process PDF text: chunk it, generate embeddings, and store in vector store
 * POST /api/ai/process-pdf
 * Body: { documentId: string, text: string, metadata?: object }
 */
app.post('/api/ai/process-pdf', async (req, res) => {
  try {
    // OpenAI is required for embeddings (Deep Seek doesn't support embeddings)
    if (!openaiClient) {
      return res.status(503).json({ 
        error: 'OpenAI API not configured',
        details: 'Embeddings require a valid OPENAI_API_KEY environment variable. Please set it and restart the server.'
      });
    }

    const { documentId, text, metadata = {} } = req.body;

    if (!documentId || !text) {
      return res.status(400).json({ error: 'documentId and text are required' });
    }

    // Chunk the text
    const chunks = chunkText(text, {
      chunkSize: 1000,
      chunkOverlap: 200,
      minChunkSize: 100
    });

    // Add metadata tags
    const taggedChunks = addMetadataTags(chunks, text);

    // Generate embeddings for all chunks in batch (use OpenAI)
    const texts = taggedChunks.map(chunk => chunk.text);
    let embeddings;
    try {
      embeddings = await generateEmbeddingsBatch(texts, { useDeepSeek: false });
    } catch (embedError) {
      console.error('Error generating embeddings:', embedError);
      // Check if it's an authentication error
      if (embedError.message && embedError.message.includes('API key')) {
        return res.status(401).json({ 
          error: 'Invalid OpenAI API key',
          details: 'Please check your OPENAI_API_KEY environment variable. You can find your API key at https://platform.openai.com/account/api-keys'
        });
      }
      return res.status(500).json({ 
        error: 'Failed to generate embeddings',
        details: embedError.message || 'Please check your OpenAI API key and account status.'
      });
    }

    // Attach embeddings to chunks
    const chunksWithEmbeddings = taggedChunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index]
    }));

    // Store in vector store
    vectorStore.storeDocument(documentId, {
      ...metadata,
      textLength: text.length,
      processedAt: new Date().toISOString()
    }, chunksWithEmbeddings);

    res.json({
      success: true,
      documentId,
      chunkCount: chunksWithEmbeddings.length,
      message: 'PDF processed and stored successfully'
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    // Don't expose internal error details, but provide helpful message
    if (error.message && error.message.includes('API key')) {
      res.status(401).json({ 
        error: 'Invalid OpenAI API key',
        details: 'Please check your OPENAI_API_KEY environment variable.'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to process PDF', 
        details: error.message || 'An unexpected error occurred. Please check your API configuration.'
      });
    }
  }
});

/**
 * Semantic search: find similar chunks based on query
 * POST /api/ai/search
 * Body: { query: string, documentId?: string, topK?: number, tags?: string[] }
 */
app.post('/api/ai/search', async (req, res) => {
  try {
    // Use OpenAI for embeddings (Deep Seek doesn't support embeddings)
    const useDeepSeek = false; // Deep Seek doesn't support embeddings
    if (!openaiClient && !deepSeekClient) {
      return res.status(503).json({ error: 'No AI API configured. Please set OPENAI_API_KEY (required for embeddings) or DEEPSEEK_API_KEY environment variable.' });
    }

    const { query, documentId, topK = 5, tags = [] } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    // Generate embedding for the query (use OpenAI)
    const queryEmbedding = await generateEmbedding(query, { useDeepSeek: false });

    // Search for similar chunks
    const results = vectorStore.searchSimilar(queryEmbedding, {
      documentId,
      topK,
      tags: Array.isArray(tags) ? tags : []
    });

    res.json({
      query,
      results: results.map(result => ({
        text: result.text,
        similarity: result.similarity,
        chunkIndex: result.chunkIndex,
        tags: result.tags,
        metadata: result.metadata
      })),
      count: results.length
    });
  } catch (error) {
    console.error('Error in semantic search:', error);
    res.status(500).json({ error: 'Failed to perform search', details: error.message });
  }
});

/**
 * Q&A: Answer questions about the PDF using RAG (Retrieval Augmented Generation)
 * POST /api/ai/ask
 * Body: { question: string, documentId: string, topK?: number }
 */
app.post('/api/ai/ask', async (req, res) => {
  try {
    if (!openaiClient) {
      return res.status(503).json({ error: 'OpenAI API not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const { question, documentId, topK = 5 } = req.body;

    if (!question || !documentId) {
      return res.status(400).json({ error: 'question and documentId are required' });
    }

    // Get document to verify it exists
    const document = vectorStore.getDocument(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found. Please process the PDF first.' });
    }

    // Generate embedding for the question
    const questionEmbedding = await generateEmbedding(question);

    // Find relevant chunks
    const relevantChunks = vectorStore.searchSimilar(questionEmbedding, {
      documentId,
      topK,
      minScore: 0.3 // Minimum similarity threshold
    });

    if (relevantChunks.length === 0) {
      return res.json({
        answer: "I couldn't find relevant information in the document to answer this question.",
        sources: []
      });
    }

    // Build context from relevant chunks
    const context = relevantChunks
      .map((chunk, index) => `[${index + 1}] ${chunk.text}`)
      .join('\n\n');

    // Use OpenAI to generate answer based on context
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that answers questions based on the provided document context. Only use information from the context to answer. If the context doesn\'t contain enough information, say so.'
        },
        {
          role: 'user',
          content: `Context from document:\n\n${context}\n\nQuestion: ${question}\n\nAnswer the question based only on the context provided above.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const answer = completion.choices[0].message.content;

    res.json({
      answer,
      sources: relevantChunks.map(chunk => ({
        text: chunk.text.substring(0, 200) + '...',
        similarity: chunk.similarity,
        chunkIndex: chunk.chunkIndex
      }))
    });
  } catch (error) {
    console.error('Error in Q&A:', error);
    res.status(500).json({ error: 'Failed to answer question', details: error.message });
  }
});

/**
 * Generate timeline: Extract timeline of events from the PDF
 * POST /api/ai/timeline
 * Body: { documentId: string }
 */
app.post('/api/ai/timeline', async (req, res) => {
  try {
    // Use OpenAI for embeddings (Deep Seek doesn't support embeddings)
    // Use Deep Seek for chat (cheaper) if available, otherwise OpenAI
    const useDeepSeekEmbeddings = false; // Deep Seek doesn't support embeddings
    const chatClient = deepSeekClient || openaiClient;
    
    if (!chatClient) {
      return res.status(503).json({ error: 'No AI API configured. Please set DEEPSEEK_API_KEY or OPENAI_API_KEY environment variable.' });
    }

    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'documentId is required' });
    }

    // Get document
    const document = vectorStore.getDocument(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found. Please process the PDF first.' });
    }

    // Get all chunks
    const allChunks = vectorStore.getDocumentChunks(documentId);
    console.log(`Processing timeline for document ${documentId} with ${allChunks.length} chunks`);
    
    // Skip story check - proceed directly to timeline generation

    // Get chunks with timeline tags or rich temporal metadata, or search for timeline-related content
    const timelineChunks = allChunks.filter(chunk => {
      const tags = Array.isArray(chunk.tags) ? chunk.tags : [];
      const metadata = chunk.metadata || {};
      const temporal = metadata.temporal || {};

      const hasTimelineTag = tags.includes('has_timeline');
      const hasDateTag = tags.includes('has_dates');
      const hasTimeTag = tags.includes('has_times');

      const hasTemporalMetadata =
        Array.isArray(temporal.dates) && temporal.dates.length > 0 ||
        Array.isArray(temporal.times) && temporal.times.length > 0 ||
        Array.isArray(temporal.relativeDays) && temporal.relativeDays.length > 0 ||
        Array.isArray(temporal.relativeWeeks) && temporal.relativeWeeks.length > 0 ||
        Array.isArray(temporal.relativeYears) && temporal.relativeYears.length > 0;

      return hasTimelineTag || hasDateTag || hasTimeTag || hasTemporalMetadata;
    });

    // If no timeline chunks found, search for chunks that might contain timeline information
    let chunksToAnalyze = timelineChunks;
    if (chunksToAnalyze.length === 0) {
      // Search for timeline-related content using embeddings
      const timelineQuery = await generateEmbedding('timeline events chronological order sequence story plot', { useDeepSeek: useDeepSeekEmbeddings });
      const searchResults = vectorStore.searchSimilar(timelineQuery, {
        documentId,
        topK: 15,
        minScore: 0.2
      });
      chunksToAnalyze = searchResults;
    } else {
      // Use timeline chunks plus some additional context
      chunksToAnalyze = [...timelineChunks, ...allChunks.slice(0, 10)].slice(0, 15);
    }

    // Combine relevant chunks
    const context = chunksToAnalyze
      .slice(0, 20) // Limit to top 20 chunks for better context
      .map(chunk => chunk.text)
      .join('\n\n');
    
    console.log(`Using ${chunksToAnalyze.length} chunks for timeline generation. Context length: ${context.length} characters`);

    // Use AI to extract timeline
    let completion;
    try {
      // Deep Seek might not support response_format, so we'll handle it differently
      const timelineMessages = [
        {
          role: 'system',
          content: `You are an advanced assistant that extracts accurate chronological timelines from business case readings, HBS cases, and narrative texts. Your core objective is to identify the key events and order them chronologically, even when the text contains multiple inconsistent or overlapping time formats (e.g., weekdays, clock times, years, relative dates, decades).

Primary Responsibilities
1. Extract the MOST relevant events

Include events important for understanding the case:

Strategic decisions or turning points

Launches, failures, milestones

Leadership or organizational changes

Conflicts, negotiations, and key meetings

Market or industry developments

Financial events or crisis triggers

Ignore trivial, tangential, or descriptive non-events.

2. Detect ALL timestamp formats present in the reading

You must recognize every type of time reference, including:

Explicit calendar references

Full dates: "January 15, 2020", "15/01/2020", "2020-01-15"

Partial dates: "January 2020", "Q3 2018", "Spring 2017"

Years: "1995", "the early 2000s", "’09"

Time-of-day references

"3:15 PM", "08:30", "near midnight"

Weekday references

"On Monday", "Later that Tuesday"

Relative time

"the next day", "that afternoon", "two weeks later"

"Year 5", "Day 3", "Month 14"

Ranges or durations

"over the next 18 months", "from 2010 to 2015"

Mixed formats appearing in a single reading

Treat each event’s timestamp individually; do not try to convert them to the same granularity.

3. Normalize timestamps WITHOUT forcing a single format

The output timeline must preserve the time format that best reflects the event, because readings often mix granularity.

Use this normalization strategy:

If full date available → "yyyy-mm-dd"

If month & year → "yyyy-mm"

If only year → "yyyy"

If time-of-day alone (no date):

If the surrounding text gives a date anchor, attach it (e.g., "2020-05-05T13:30").

Otherwise keep the time as "13:30".

If weekday (“Monday”) without a date:

If anchored to a previously given date/week, use inferred date.

Otherwise preserve it as "Monday".

Relative timestamps:

If attachable to an absolute date:
"2 weeks later" → "2021-06 (approx.)"

If anchoring is impossible:
keep "2 weeks later".

4. Chronological Ordering Across Mixed Formats

Your job is to order events according to the actual narrative timeline, not the order in which they appear in the text.

To do this:

Use absolute dates when available.

Use relative timestamps anchored to the nearest explicit date.

Use contextual inference (e.g., if Monday → next Tuesday → next Friday).

If two events cannot be ordered with certainty, keep original order but flag uncertainty by placing them sequentially.

5. Identify Stages (if applicable)

If the text lends itself to being divided into distinct stages, phases, or periods, identify these stages and assign each event to its corresponding stage. Examples of stages might include:
- "Initial Setup" / "Growth Phase" / "Crisis" / "Resolution"
- "Planning" / "Implementation" / "Evaluation"
- "Early Years" / "Expansion" / "Maturity"
- Or any other natural divisions in the narrative

If the text does not naturally separate into stages (e.g., it's a continuous narrative without clear phases), you may omit the stage field or set it to null.

6. Assess Event Importance

For each event, assess its importance relative to the central theme:
- "high": Events that are critical to understanding the central theme, major turning points, or key decisions
- "medium": Events that are relevant and contribute to the narrative but are not central
- "low": Events that provide context but are secondary to the main story

Focus on selecting events that are at least "medium" importance. Only include "low" importance events if they provide essential context or transitions.

7. Output Format (STRICT)

Return a JSON object with a "timeline" array.
Each event MUST have the structure:

{
  "event": "short title",
  "description": "1–2 sentences explaining what happened",
  "order": 1,
  "date_original_format": "the timestamp as described in the reading, or the best short human description such as 'January 2021' or 'around 2021'",
  "date_normalized": "normalized timestamp or null if not inferable",
  "date": "optional display date; usually the same as date_original_format",
  "importance": "high" | "medium" | "low",
  "stage": "stage name" | null
}

Rules for dates:

- If the text contains ANY explicit or relative time information for the event (month, year, weekday, time of day, decade, 'two years later', 'Day 3', etc.), you MUST set date_original_format to a non-null string that reflects that information.
- Only use null for date_original_format AND date_normalized when the text truly gives NO time information for that event.
- If you can infer an approximate year from context (e.g., "two years after the 2019 launch" -> around 2021), you SHOULD set:
  - "date_original_format": "around 2021"
  - "date_normalized": "2021"
- If the text says "In January 2021", you SHOULD set:
  - "date_original_format": "January 2021"
  - "date_normalized": "2021-01"
- The optional "date" field MAY be included and should usually match date_original_format.

Notes

date_original_format preserves fidelity to the reading.

date_normalized is for machine sorting.

If no timestamp exists, both fields can be "null".

8. Additional Guidelines

NEVER invent precise dates that are not justified by the text.

When ambiguity exists, make conservative inferences (e.g., only year or month+year).

Focus on useful, case-relevant events that support the central theme.

Ensure the timeline is readable for humans and structured for machines.

When assigning importance, be selective: most events should be "high" or "medium" importance. Only include "low" importance events when they provide essential context or smooth transitions between major events.

When identifying stages, be thoughtful: only create stages if the narrative naturally divides into distinct phases. If the text is a continuous flow without clear divisions, set stage to null for all events.`
        },
        {
          role: 'user',
          content: `Extract a timeline of the main events from this story. First, identify the central axis or theme that this case is trying to teach, then select events that are most relevant to understanding that theme.\n\nFor EVERY event that has any time-related information (explicit date, month, year, decade, weekday, time-of-day, or relative phrase like "two years later", "Day 3"), you MUST set both:\n- "date_original_format": a short human-readable string describing the time (for example "January 2021", "around 2021", "Year 5", "Day 3")\n- "date_normalized": a machine-sortable approximation whenever possible (for example "2021-01", "2021", "year-5", "day-3"), or null ONLY if you truly cannot infer anything.\n\nOnly use null for both date_original_format and date_normalized if there is absolutely no time context for that event.\n\nIf the text naturally divides into distinct stages or phases, identify these stages and assign each event to its corresponding stage. If the text doesn't lend itself to stage separation, set "stage" to null.\n\nAssess the importance of each event relative to the central theme: "high" for critical events, "medium" for relevant events, "low" for secondary context events.\n\nReturn JSON with this structure exactly:\n{\n  "timeline": [\n    {\n      "event": "Event title",\n      "description": "What happened (1-2 sentences)",\n      "order": 1,\n      "date_original_format": "the timestamp as described in the reading or a short human description",\n      "date_normalized": "normalized timestamp suitable for sorting, or null if not inferable",\n      "importance": "high" | "medium" | "low",\n      "stage": "stage name" | null\n    },\n    ...\n  ]\n}\n\nText to analyze:\n\n${context}`
        }
      ];
      
      const timelineRequest = {
        model: deepSeekClient ? 'deepseek-chat' : 'gpt-4o-mini',
        messages: timelineMessages,
        temperature: 0.3
      };
      
      // Only add response_format for OpenAI (Deep Seek may not support it)
      if (!deepSeekClient) {
        timelineRequest.response_format = { type: 'json_object' };
      }
      
      completion = await chatClient.chat.completions.create(timelineRequest);
    } catch (timelineError) {
      console.error('Error generating timeline with chat client:', timelineError);
      // If Deep Seek fails, try OpenAI as fallback
      if (deepSeekClient && openaiClient) {
        console.log('Falling back to OpenAI for timeline generation');
        try {
          completion = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an advanced assistant that extracts accurate chronological timelines from business case readings, HBS cases, and narrative texts. Your core objective is to identify the key events and order them chronologically, even when the text contains multiple inconsistent or overlapping time formats (e.g., weekdays, clock times, years, relative dates, decades).

Primary Responsibilities
0. Identify the Central Axis or Theme

Before extracting events, identify the central axis or theme that the case/reading is trying to teach. This is the core lesson, strategic question, or narrative thread that ties the case together. Use this theme to:
- Prioritize events that are most relevant to understanding this central theme
- Filter out events that are tangential or not essential to the case's core message
- Ensure the timeline highlights the events that best illustrate the central teaching point

1. Extract the MOST relevant events (filtered by central theme)

Include events important for understanding the case and its central theme:

Strategic decisions or turning points

Launches, failures, milestones

Leadership or organizational changes

Conflicts, negotiations, and key meetings

Market or industry developments

Financial events or crisis triggers

Ignore trivial, tangential, or descriptive non-events that don't contribute to understanding the central theme.

2. Detect ALL timestamp formats present in the reading

You must recognize every type of time reference, including:

Explicit calendar references

Full dates: "January 15, 2020", "15/01/2020", "2020-01-15"

Partial dates: "January 2020", "Q3 2018", "Spring 2017"

Years: "1995", "the early 2000s", "’09"

Time-of-day references

"3:15 PM", "08:30", "near midnight"

Weekday references

"On Monday", "Later that Tuesday"

Relative time

"the next day", "that afternoon", "two weeks later"

"Year 5", "Day 3", "Month 14"

Ranges or durations

"over the next 18 months", "from 2010 to 2015"

Mixed formats appearing in a single reading

Treat each event’s timestamp individually; do not try to convert them to the same granularity.

3. Normalize timestamps WITHOUT forcing a single format

The output timeline must preserve the time format that best reflects the event, because readings often mix granularity.

Use this normalization strategy:

If full date available → "yyyy-mm-dd"

If month & year → "yyyy-mm"

If only year → "yyyy"

If time-of-day alone (no date):

If the surrounding text gives a date anchor, attach it (e.g., "2020-05-05T13:30").

Otherwise keep the time as "13:30".

If weekday (“Monday”) without a date:

If anchored to a previously given date/week, use inferred date.

Otherwise preserve it as "Monday".

Relative timestamps:

If attachable to an absolute date:
"2 weeks later" → "2021-06 (approx.)"

If anchoring is impossible:
keep "2 weeks later".

4. Chronological Ordering Across Mixed Formats

Your job is to order events according to the actual narrative timeline, not the order in which they appear in the text.

To do this:

Use absolute dates when available.

Use relative timestamps anchored to the nearest explicit date.

Use contextual inference (e.g., if Monday → next Tuesday → next Friday).

If two events cannot be ordered with certainty, keep original order but flag uncertainty by placing them sequentially.

5. Identify Stages (if applicable)

If the text lends itself to being divided into distinct stages, phases, or periods, identify these stages and assign each event to its corresponding stage. Examples of stages might include:
- "Initial Setup" / "Growth Phase" / "Crisis" / "Resolution"
- "Planning" / "Implementation" / "Evaluation"
- "Early Years" / "Expansion" / "Maturity"
- Or any other natural divisions in the narrative

If the text does not naturally separate into stages (e.g., it's a continuous narrative without clear phases), you may omit the stage field or set it to null.

6. Assess Event Importance

For each event, assess its importance relative to the central theme:
- "high": Events that are critical to understanding the central theme, major turning points, or key decisions
- "medium": Events that are relevant and contribute to the narrative but are not central
- "low": Events that provide context but are secondary to the main story

Focus on selecting events that are at least "medium" importance. Only include "low" importance events if they provide essential context or transitions.

7. Output Format (STRICT)

Return a JSON object with a "timeline" array.
Each event MUST have the structure:

{
  "event": "short title",
  "description": "1–2 sentences explaining what happened",
  "order": 1,
  "date_original_format": "the timestamp as described in the reading, or the best short human description such as 'January 2021' or 'around 2021'",
  "date_normalized": "normalized timestamp or null if not inferable",
  "date": "optional display date; usually the same as date_original_format",
  "importance": "high" | "medium" | "low",
  "stage": "stage name" | null
}

Rules for dates:

- If the text contains ANY explicit or relative time information for the event (month, year, weekday, time of day, decade, 'two years later', 'Day 3', etc.), you MUST set date_original_format to a non-null string that reflects that information.
- Only use null for date_original_format AND date_normalized when the text truly gives NO time information for that event.
- If you can infer an approximate year from context (e.g., "two years after the 2019 launch" -> around 2021), you SHOULD set:
  - "date_original_format": "around 2021"
  - "date_normalized": "2021"
- If the text says "In January 2021", you SHOULD set:
  - "date_original_format": "January 2021"
  - "date_normalized": "2021-01"
- The optional "date" field MAY be included and should usually match date_original_format.

Notes

date_original_format preserves fidelity to the reading.

date_normalized is for machine sorting.

If no timestamp exists, both fields can be "null".

8. Additional Guidelines

NEVER invent precise dates that are not justified by the text.

When ambiguity exists, make conservative inferences (e.g., only year or month+year).

Focus on useful, case-relevant events that support the central theme.

Ensure the timeline is readable for humans and structured for machines.

When assigning importance, be selective: most events should be "high" or "medium" importance. Only include "low" importance events when they provide essential context or smooth transitions between major events.

When identifying stages, be thoughtful: only create stages if the narrative naturally divides into distinct phases. If the text is a continuous flow without clear divisions, set stage to null for all events.`
              },
              {
                role: 'user',
                content: `Extract a timeline of the main events from this story. First, identify the central axis or theme that this case is trying to teach, then select events that are most relevant to understanding that theme.\n\nFor EVERY event that has any time-related information (explicit date, month, year, decade, weekday, time-of-day, or relative phrase like "two years later", "Day 3"), you MUST set both:\n- "date_original_format": a short human-readable string describing the time (for example "January 2021", "around 2021", "Year 5", "Day 3")\n- "date_normalized": a machine-sortable approximation whenever possible (for example "2021-01", "2021", "year-5", "day-3"), or null ONLY if you truly cannot infer anything.\n\nOnly use null for both date_original_format and date_normalized if there is absolutely no time context for that event.\n\nIf the text naturally divides into distinct stages or phases, identify these stages and assign each event to its corresponding stage. If the text doesn't lend itself to stage separation, set "stage" to null.\n\nAssess the importance of each event relative to the central theme: "high" for critical events, "medium" for relevant events, "low" for secondary context events.\n\nReturn JSON with this structure exactly:\n{\n  "timeline": [\n    {\n      "event": "Event title",\n      "description": "What happened (1-2 sentences)",\n      "order": 1,\n      "date_original_format": "the timestamp as described in the reading or a short human description",\n      "date_normalized": "normalized timestamp suitable for sorting, or null if not inferable",\n      "importance": "high" | "medium" | "low",\n      "stage": "stage name" | null\n    },\n    ...\n  ]\n}\n\nText to analyze:\n\n${context}`
              }
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' }
          });
        } catch (fallbackError) {
          console.error('Error with OpenAI fallback for timeline:', fallbackError);
          throw new Error(`Failed to generate timeline: ${fallbackError.message}`);
        }
      } else {
        throw new Error(`Failed to generate timeline: ${timelineError.message}`);
      }
    }

    let timeline;
    try {
      const responseText = completion.choices[0].message.content;
      let parsed;
      
      // Try to parse as JSON directly
      try {
        parsed = JSON.parse(responseText);
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from the response
        // (Deep Seek might wrap JSON in markdown or text)
        console.log('Direct JSON parse failed, trying to extract JSON from response...');
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            console.error('Failed to parse extracted JSON:', e);
            throw new Error(`Failed to parse timeline response. Response was: ${responseText.substring(0, 200)}...`);
          }
        } else {
          throw new Error(`No JSON found in response. Response was: ${responseText.substring(0, 200)}...`);
        }
      }
      
      timeline = parsed.timeline || parsed.events || [];
      
      if (!Array.isArray(timeline)) {
        // If timeline is not an array, try to convert it
        if (typeof timeline === 'object' && timeline !== null) {
          timeline = [timeline];
        } else {
          timeline = [];
        }
      }

      // Helper to infer a simple date string from event text if the model omitted it
      const inferDateFromText = (text) => {
        if (!text || typeof text !== 'string') return null;

        // Match patterns like "January 2021", "Jan 2021"
        const monthNames =
          '(January|February|March|April|May|June|July|August|September|October|November|December|' +
          'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
        const monthYearRegex = new RegExp(`\\b${monthNames}\\s+(\\d{4})\\b`, 'i');
        const monthYearMatch = text.match(monthYearRegex);
        if (monthYearMatch) {
          // e.g. "January 2021"
          return monthYearMatch[0];
        }

        // Bare 4-digit year like 2019, 2021
        const yearMatch = text.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          return yearMatch[0];
        }

        return null;
      };

      // Ensure each event has order and normalize date fields for frontend compatibility
      timeline = timeline
        .map((event, index) => {
          // Support both new fields (date_original_format/date_normalized)
          // and legacy field (date), and always expose a unified `date` for the UI.
          let dateOriginal =
            event.date_original_format ??
            event.dateOriginalFormat ??
            event.date ??
            null;

          let dateNormalized =
            event.date_normalized ??
            event.dateNormalized ??
            null;

          // If the model failed to provide any date fields, try to infer from text
          if (!dateOriginal && !dateNormalized) {
            const inferred = inferDateFromText(event.description || event.event || '');
            if (inferred) {
              dateOriginal = inferred;

              // Best-effort normalized value: if it's month+year, convert to yyyy-mm; if bare year, keep as-is
              const monthYearMatch = inferred.match(
                new RegExp(
                  `^${'(January|February|March|April|May|June|July|August|September|October|November|December|' +
                    'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)'}\\s+(\\d{4})$`,
                  'i'
                )
              );
              if (monthYearMatch) {
                const monthName = monthYearMatch[1].toLowerCase();
                const year = monthYearMatch[2];
                const monthIndex = [
                  'january',
                  'february',
                  'march',
                  'april',
                  'may',
                  'june',
                  'july',
                  'august',
                  'september',
                  'october',
                  'november',
                  'december'
                ].findIndex((m) => monthName.startsWith(m.slice(0, 3)));
                if (monthIndex >= 0) {
                  const month = String(monthIndex + 1).padStart(2, '0');
                  dateNormalized = `${year}-${month}`;
                } else {
                  dateNormalized = year;
                }
              } else {
                // If it's just a year like "2021"
                const yearOnlyMatch = inferred.match(/^(19|20)\d{2}$/);
                if (yearOnlyMatch) {
                  dateNormalized = inferred;
                }
              }
            }
          }

          // Prefer the original format for display, fall back to normalized or legacy `date`
          const unifiedDate =
            event.date ??
            dateOriginal ??
            dateNormalized ??
            null;

          return {
            ...event,
            date_original_format: dateOriginal ?? null,
            date_normalized: dateNormalized ?? null,
            date: unifiedDate,
            order: event.order || index + 1,
            importance: event.importance || 'medium', // Default to medium if not provided
            stage: event.stage ?? null // Preserve null if explicitly set, otherwise default to null
          };
        })
        .sort((a, b) => a.order - b.order);

      // Validate timeline has events
      if (timeline.length === 0) {
        console.log('Timeline extraction returned empty array. Response was:', completion.choices[0].message.content.substring(0, 500));
        return res.json({
          success: false,
          message: 'Could not extract a timeline from the document. The AI may not have found clear chronological events.',
          timeline: []
        });
      }
    } catch (parseError) {
      console.error('Error parsing timeline response:', parseError);
      console.error('Response content:', completion.choices[0].message.content.substring(0, 500));
      throw new Error(`Failed to parse timeline response: ${parseError.message}`);
    }

    console.log(`Timeline generated successfully with ${timeline.length} events`);
    res.json({
      success: true,
      timeline,
      eventCount: timeline.length,
      documentId
    });
  } catch (error) {
    console.error('Error generating timeline:', error);
    res.status(500).json({ error: 'Failed to generate timeline', details: error.message });
  }
});

/**
 * Extract characters: Identify characters and search for images
 * POST /api/ai/characters
 * Body: { documentId: string }
 */
app.post('/api/ai/characters', async (req, res) => {
  try {
    if (!openaiClient) {
      return res.status(503).json({ error: 'OpenAI API not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'documentId is required' });
    }

    // Get document
    const document = vectorStore.getDocument(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found. Please process the PDF first.' });
    }

    // Get all chunks with character tags
    const allChunks = vectorStore.getDocumentChunks(documentId);
    const characterChunks = allChunks.filter(chunk => 
      chunk.tags && chunk.tags.includes('has_characters')
    );

    // Combine character-related chunks
    const context = characterChunks.length > 0
      ? characterChunks.slice(0, 20).map(chunk => chunk.text).join('\n\n')
      : allChunks.slice(0, 15).map(chunk => chunk.text).join('\n\n');

    // Use OpenAI to extract characters
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts character information from stories. Analyze the provided text and identify all characters mentioned. Return a JSON object with a "characters" array. Each character should have: name, description (brief), and optionally role or importance.'
        },
        {
          role: 'user',
          content: `Extract all characters from this story:\n\n${context}\n\nReturn a JSON object with a "characters" array. Each character should have: name, description, and role (if mentioned).`
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    let characters;
    try {
      const responseText = completion.choices[0].message.content;
      const parsed = JSON.parse(responseText);
      characters = parsed.characters || parsed;
      if (!Array.isArray(characters)) {
        characters = [characters];
      }
    } catch (parseError) {
      throw new Error('Failed to parse characters response');
    }

    // For each character, generate a search query and use OpenAI to find image URLs
    // Note: OpenAI doesn't directly provide image search, but we can use DALL-E or
    // provide search queries that the frontend can use with an image search API
    const charactersWithSearch = await Promise.all(
      characters.map(async (character) => {
        try {
          // Generate a search query for the character
          const searchCompletion = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'Generate a search query to find images of a character. Return only the search query text, nothing else.'
              },
              {
                role: 'user',
                content: `Character: ${character.name}. ${character.description || ''}. Generate a search query to find images of this character.`
              }
            ],
            temperature: 0.5,
            max_tokens: 50
          });

          const searchQuery = searchCompletion.choices[0].message.content.trim();

          return {
            ...character,
            imageSearchQuery: searchQuery,
            // Note: Actual image URLs would need to be fetched using an image search API
            // (e.g., Google Custom Search, Unsplash API, etc.) on the frontend
          };
        } catch (error) {
          console.error(`Error generating search query for ${character.name}:`, error);
          return {
            ...character,
            imageSearchQuery: character.name,
          };
        }
      })
    );

    res.json({
      characters: charactersWithSearch,
      characterCount: charactersWithSearch.length,
      documentId
    });
  } catch (error) {
    console.error('Error extracting characters:', error);
    res.status(500).json({ error: 'Failed to extract characters', details: error.message });
  }
});

/**
 * Get document info
 * GET /api/ai/document/:documentId
 */
app.get('/api/ai/document/:documentId', (req, res) => {
  try {
    const { documentId } = req.params;
    const document = vectorStore.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const chunks = vectorStore.getDocumentChunks(documentId);
    res.json({
      documentId,
      ...document,
      chunkCount: chunks.length
    });
  } catch (error) {
    console.error('Error getting document info:', error);
    res.status(500).json({ error: 'Failed to get document info', details: error.message });
  }
});

/**
 * Delete document
 * DELETE /api/ai/document/:documentId
 */
app.delete('/api/ai/document/:documentId', (req, res) => {
  try {
    const { documentId } = req.params;
    vectorStore.deleteDocument(documentId);
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document', details: error.message });
  }
});

/**
 * Get vector store statistics
 * GET /api/ai/stats
 */
app.get('/api/ai/stats', (req, res) => {
  try {
    const stats = vectorStore.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
});

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

// Handle React Router - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


/**
 * RAPTOR Summary Service
 * 
 * Implements hierarchical summarization trees for long legal documents.
 * 
 * The idea: A 200-page contract is too long for any single embedding to capture.
 * Instead, we build a tree:
 * 
 *   Level 0: Individual chunks (800-1200 chars)
 *   Level 1: Section summaries (5-10 chunks → 1 summary)
 *   Level 2: Document summary (all sections → 1 summary)
 * 
 * Search happens at ALL levels simultaneously:
 * - "What's the governing law?" → Level 2 (document summary mentions it)
 * - "Indemnification cap?" → Level 1 (section summary of indemnification)
 * - "Exact carve-out language for willful misconduct" → Level 0 (specific chunk)
 * 
 * For legal documents specifically, this is powerful because:
 * - Contracts have natural section hierarchy
 * - Case opinions have structured analysis sections
 * - Regulatory filings have TOC-based organization
 * 
 * COST: Building the tree requires LLM calls for summarization.
 * For a 200-page document with ~250 chunks:
 *   - Level 1: ~25 summarization calls (10 chunks each)
 *   - Level 2: 1 summarization call (25 section summaries)
 *   Total: ~26 LLM calls per document (one-time cost on upload)
 *   Estimated cost: ~$0.05-0.10 per document at current Azure OpenAI pricing
 */

import { query } from '../db/connection.js';

// Azure OpenAI configuration
// IMPORTANT: The rest of the codebase uses AZURE_OPENAI_DEPLOYMENT_NAME (with _NAME suffix)
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const CHAT_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const CHAT_API_VERSION = '2024-02-15-preview';

// RAPTOR configuration
const CHUNKS_PER_SECTION = 8;    // Group this many chunks into a section summary
const MAX_SUMMARY_LENGTH = 500;  // Target summary length in words

/**
 * Build a RAPTOR summary tree for a document
 * 
 * @param {string} documentId - The document ID
 * @param {string} firmId - The firm ID
 * @param {object[]} chunks - Array of contextual chunks from the chunker
 * @param {Function} generateEmbedding - Embedding generation function
 * @returns {object} Tree statistics
 */
export async function buildSummaryTree(documentId, firmId, chunks, generateEmbedding) {
  if (!chunks || chunks.length === 0) {
    return { levels: 0, totalNodes: 0 };
  }
  
  // Skip RAPTOR for short documents (fewer than 2 sections worth of chunks)
  if (chunks.length < CHUNKS_PER_SECTION * 2) {
    console.log(`[RAPTOR] Document ${documentId} has only ${chunks.length} chunks. Skipping tree construction.`);
    return { levels: 0, totalNodes: chunks.length, skipped: true };
  }
  
  console.log(`[RAPTOR] Building summary tree for document ${documentId} with ${chunks.length} chunks`);
  
  try {
    // Clear existing summary tree for this document
    await query(`
      DELETE FROM document_summary_tree 
      WHERE firm_id = $1 AND document_id = $2
    `, [firmId, documentId]);
    
    // Level 0: Store chunk references
    const level0Ids = [];
    for (const chunk of chunks) {
      const result = await query(`
        INSERT INTO document_summary_tree (
          firm_id, document_id, level, summary_text, metadata
        ) VALUES ($1, $2, 0, $3, $4)
        RETURNING id
      `, [
        firmId,
        documentId,
        chunk.text.substring(0, 2000), // Store truncated chunk text
        JSON.stringify({
          chunkIndex: chunk.chunkIndex,
          chunkType: chunk.chunkType,
          sectionMarker: chunk.sectionMarker,
        }),
      ]);
      level0Ids.push(result.rows[0].id);
    }
    
    // Level 1: Section summaries
    const sectionGroups = groupChunksIntoSections(chunks, CHUNKS_PER_SECTION);
    const level1Ids = [];
    
    for (const group of sectionGroups) {
      const combinedText = group.chunks.map(c => c.text).join('\n\n');
      const sectionSummary = await generateLegalSummary(
        combinedText, 
        'section',
        group.sectionMarker
      );
      
      if (!sectionSummary) continue;
      
      // Generate embedding for the summary
      let summaryEmbedding = null;
      if (generateEmbedding) {
        try {
          const embResult = await generateEmbedding(sectionSummary, firmId);
          summaryEmbedding = embResult.embedding;
        } catch (e) {
          console.warn(`[RAPTOR] Failed to embed section summary: ${e.message}`);
        }
      }
      
      const childIds = group.chunkIndices.map(idx => level0Ids[idx]).filter(Boolean);
      
      const result = await query(`
        INSERT INTO document_summary_tree (
          firm_id, document_id, level, summary_text, embedding, child_chunk_ids, metadata
        ) VALUES ($1, $2, 1, $3, $4, $5, $6)
        RETURNING id
      `, [
        firmId,
        documentId,
        sectionSummary,
        summaryEmbedding,
        childIds,
        JSON.stringify({
          sectionMarker: group.sectionMarker,
          chunkCount: group.chunks.length,
          chunkRange: [group.chunkIndices[0], group.chunkIndices[group.chunkIndices.length - 1]],
        }),
      ]);
      level1Ids.push(result.rows[0].id);
    }
    
    // Level 2: Document summary (only if we have multiple sections)
    if (level1Ids.length > 1) {
      const sectionSummaries = [];
      for (const group of sectionGroups) {
        const combinedText = group.chunks.map(c => c.text).join('\n\n');
        const summary = await generateLegalSummary(combinedText, 'section', group.sectionMarker);
        if (summary) sectionSummaries.push(summary);
      }
      
      const allSectionText = sectionSummaries.join('\n\n');
      const documentSummary = await generateLegalSummary(allSectionText, 'document');
      
      if (documentSummary) {
        let docEmbedding = null;
        if (generateEmbedding) {
          try {
            const embResult = await generateEmbedding(documentSummary, firmId);
            docEmbedding = embResult.embedding;
          } catch (e) {
            console.warn(`[RAPTOR] Failed to embed document summary: ${e.message}`);
          }
        }
        
        await query(`
          INSERT INTO document_summary_tree (
            firm_id, document_id, level, summary_text, embedding, child_chunk_ids, metadata
          ) VALUES ($1, $2, 2, $3, $4, $5, $6)
        `, [
          firmId,
          documentId,
          documentSummary,
          docEmbedding,
          level1Ids,
          JSON.stringify({
            sectionCount: level1Ids.length,
            totalChunks: chunks.length,
          }),
        ]);
      }
    }
    
    const stats = {
      levels: level1Ids.length > 1 ? 3 : 2,
      totalNodes: level0Ids.length + level1Ids.length + (level1Ids.length > 1 ? 1 : 0),
      level0: level0Ids.length,
      level1: level1Ids.length,
      level2: level1Ids.length > 1 ? 1 : 0,
    };
    
    console.log(`[RAPTOR] Built summary tree: ${JSON.stringify(stats)}`);
    return stats;
  } catch (error) {
    console.error(`[RAPTOR] Failed to build summary tree for ${documentId}:`, error.message);
    return { levels: 0, totalNodes: 0, error: error.message };
  }
}

/**
 * Group chunks into sections based on section markers and position
 */
function groupChunksIntoSections(chunks, groupSize) {
  const groups = [];
  let currentGroup = { chunks: [], chunkIndices: [], sectionMarker: '' };
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Start a new group if:
    // 1. Current group is at capacity, OR
    // 2. We hit a new section marker
    const isNewSection = chunk.sectionMarker && 
      chunk.sectionMarker !== 'document_start' &&
      chunk.sectionMarker !== currentGroup.sectionMarker;
    
    if ((currentGroup.chunks.length >= groupSize || isNewSection) && currentGroup.chunks.length > 0) {
      groups.push({ ...currentGroup });
      currentGroup = { chunks: [], chunkIndices: [], sectionMarker: '' };
    }
    
    if (!currentGroup.sectionMarker && chunk.sectionMarker) {
      currentGroup.sectionMarker = chunk.sectionMarker;
    }
    
    currentGroup.chunks.push(chunk);
    currentGroup.chunkIndices.push(i);
  }
  
  // Add final group
  if (currentGroup.chunks.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

/**
 * Generate a legal-domain-aware summary using Azure OpenAI
 * 
 * @param {string} text - Text to summarize
 * @param {string} level - 'section' or 'document'
 * @param {string} sectionMarker - Optional section context
 * @returns {string|null} The summary text
 */
async function generateLegalSummary(text, level = 'section', sectionMarker = '') {
  if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
    // Fallback: extractive summary (first and last paragraphs)
    return extractiveSummary(text, level);
  }
  
  const systemPrompt = level === 'document'
    ? `You are a legal document summarizer. Create a concise summary of the entire document that captures:
       - Document type and parties involved
       - Key obligations and rights
       - Critical terms (dates, amounts, conditions)
       - Governing law and jurisdiction
       - Any unusual or notable provisions
       Keep the summary under ${MAX_SUMMARY_LENGTH} words. Be precise and use legal terminology accurately.`
    : `You are a legal document summarizer. Create a concise summary of this document section${sectionMarker ? ` (${sectionMarker})` : ''} that captures:
       - The main legal concepts or obligations in this section
       - Key defined terms referenced
       - Critical conditions or limitations
       - Cross-references to other sections
       Keep the summary under ${Math.floor(MAX_SUMMARY_LENGTH / 2)} words. Be precise.`;
  
  try {
    const url = `${AZURE_ENDPOINT}openai/deployments/${CHAT_DEPLOYMENT}/chat/completions?api-version=${CHAT_API_VERSION}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Summarize this legal text:\n\n${text.substring(0, 8000)}` },
        ],
        max_tokens: 600,
        temperature: 0.1, // Low temperature for factual summaries
      }),
    });
    
    if (!response.ok) {
      console.warn(`[RAPTOR] Azure OpenAI summarization failed: ${response.status}`);
      return extractiveSummary(text, level);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || extractiveSummary(text, level);
  } catch (error) {
    console.warn(`[RAPTOR] Summarization error: ${error.message}`);
    return extractiveSummary(text, level);
  }
}

/**
 * Fallback extractive summary when LLM is not available
 * Takes first paragraph and key sentences
 */
function extractiveSummary(text, level) {
  const paragraphs = text.split(/\n\s*\n+/).filter(p => p.trim().length > 20);
  
  if (paragraphs.length === 0) return null;
  if (paragraphs.length === 1) return paragraphs[0].substring(0, 500);
  
  // Take first paragraph + sentences with key legal terms
  const firstPara = paragraphs[0].substring(0, 300);
  
  const keyTerms = /(?:shall|must|agree|warrant|represent|indemnif|terminat|govern|jurisdict|liabil)/i;
  const keySentences = [];
  
  for (let i = 1; i < paragraphs.length && keySentences.length < 3; i++) {
    const sentences = paragraphs[i].match(/[^.!?]+[.!?]+/g) || [];
    for (const sentence of sentences) {
      if (keyTerms.test(sentence) && keySentences.length < 3) {
        keySentences.push(sentence.trim().substring(0, 200));
      }
    }
  }
  
  return [firstPara, ...keySentences].join(' ');
}

/**
 * Search the RAPTOR summary tree
 * Returns matching summaries at the appropriate abstraction level
 * 
 * @param {number[]} queryEmbedding - The query embedding vector
 * @param {string} firmId - The firm ID
 * @param {object} options - Search options
 * @returns {object[]} Matching summary nodes with their level and document info
 */
export async function searchSummaryTree(queryEmbedding, firmId, options = {}) {
  const {
    limit = 10,
    threshold = 0.65,
    levels = [1, 2], // Search section and document summaries by default
    documentId = null,
  } = options;
  
  try {
    const result = await query(`
      SELECT 
        st.id,
        st.document_id,
        st.level,
        st.summary_text,
        st.child_chunk_ids,
        st.metadata,
        d.name as document_name,
        d.type as document_type,
        d.matter_id,
        m.name as matter_name,
        1 - (st.embedding <=> $1::vector) AS similarity
      FROM document_summary_tree st
      JOIN documents d ON d.id = st.document_id AND d.firm_id = st.firm_id
      LEFT JOIN matters m ON m.id = d.matter_id AND m.firm_id = d.firm_id
      WHERE st.firm_id = $2
        AND st.level = ANY($3::INTEGER[])
        AND st.embedding IS NOT NULL
        AND ($4::UUID IS NULL OR st.document_id = $4)
        AND 1 - (st.embedding <=> $1::vector) >= $5
      ORDER BY similarity DESC
      LIMIT $6
    `, [
      queryEmbedding,
      firmId,
      levels,
      documentId,
      threshold,
      limit,
    ]);
    
    return result.rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      documentType: row.document_type,
      matterId: row.matter_id,
      matterName: row.matter_name,
      level: row.level,
      summaryText: row.summary_text,
      childChunkIds: row.child_chunk_ids,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
      source: 'raptor_summary',
      levelLabel: row.level === 2 ? 'document' : row.level === 1 ? 'section' : 'chunk',
    }));
  } catch (error) {
    console.error('[RAPTOR] Search error:', error.message);
    return [];
  }
}

/**
 * Get the full drill-down path from a summary node to its source chunks
 */
export async function drillDown(summaryNodeId, firmId) {
  try {
    const result = await query(`
      WITH RECURSIVE tree AS (
        -- Start node
        SELECT id, document_id, level, summary_text, child_chunk_ids, metadata
        FROM document_summary_tree
        WHERE id = $1 AND firm_id = $2
        
        UNION ALL
        
        -- Child nodes
        SELECT st.id, st.document_id, st.level, st.summary_text, st.child_chunk_ids, st.metadata
        FROM document_summary_tree st
        INNER JOIN tree t ON st.id = ANY(t.child_chunk_ids)
        WHERE st.firm_id = $2
      )
      SELECT * FROM tree ORDER BY level ASC
    `, [summaryNodeId, firmId]);
    
    return result.rows;
  } catch (error) {
    console.error('[RAPTOR] Drill-down error:', error.message);
    return [];
  }
}

export default {
  buildSummaryTree,
  searchSummaryTree,
  drillDown,
};

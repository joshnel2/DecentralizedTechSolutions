/**
 * Embedding Service for Semantic Search
 * 
 * Provides:
 * 1. Document chunking optimized for legal documents (with contextual retrieval)
 * 2. Azure OpenAI embeddings generation
 * 3. pgvector storage with tenant isolation
 * 4. Per-tenant encryption via encryptionService (HKDF + AES-256-GCM)
 * 5. Hybrid retrieval via retrievalPipeline (vector + keyword + graph + RAPTOR)
 * 6. Integration with contextualChunker for Anthropic-style context prepending
 * 7. Integration with raptorSummaryService for hierarchical summaries
 * 
 * NOTE: For full hybrid retrieval, use retrievalPipeline.js instead of
 * the semanticSearch function here. This file's semanticSearch is kept
 * for backward compatibility but the pipeline is preferred.
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';
import { encryptEmbedding as encryptViaService } from './encryptionService.js';
import { chunkWithContext, getMatterContext } from './contextualChunker.js';
import { buildSummaryTree } from './raptorSummaryService.js';

// Azure OpenAI configuration (same as ai.js)
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
const EMBEDDING_API_VERSION = '2024-02-15-preview'; // Same as chat API

// Encryption is now handled by encryptionService.js (HKDF key derivation)
// Legacy: Azure Key Vault configuration kept for backward compatibility
// IMPORTANT: KEY_VAULT_ENABLED preserves the original behavior - it only activates
// when AZURE_KEY_VAULT_NAME is explicitly set. The new encryptionService is used
// as the IMPLEMENTATION when encryption is active, but doesn't change WHEN it activates.
const AZURE_KEY_VAULT_NAME = process.env.AZURE_KEY_VAULT_NAME;
const KEY_VAULT_ENABLED = !!AZURE_KEY_VAULT_NAME;

/**
 * Generate embedding for text using Azure OpenAI
 */
export async function generateEmbedding(text, firmId) {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  const url = `${AZURE_ENDPOINT}openai/deployments/${EMBEDDING_DEPLOYMENT}/embeddings?api-version=${EMBEDDING_API_VERSION}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      input: text,
      encoding_format: 'base64', // Optional: base64 for smaller payload
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[EmbeddingService] Azure OpenAI error:', error);
    throw new Error(`Azure OpenAI embedding API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Convert base64 to float array if needed
  let embeddingVector;
  if (data.data[0].encoding_format === 'base64') {
    // Decode base64 to Float32Array
    const binaryString = atob(data.data[0].embedding);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    embeddingVector = new Float32Array(bytes.buffer);
  } else {
    // Already an array
    embeddingVector = data.data[0].embedding;
  }

  // Encrypt embedding for storage if Key Vault is configured
  // IMPORTANT: Two encryption paths exist:
  //   1. NEW (HKDF): Activated ONLY when ENCRYPTION_MASTER_SECRET is explicitly set.
  //      Uses encryptionService.js with proper HKDF key derivation. Preferred for new deployments.
  //   2. LEGACY (SHA-256): The original path, uses ENCRYPTION_SECRET with simple SHA-256 key derivation.
  //      Kept as default to avoid breaking existing encrypted data.
  // The two formats are NOT compatible - you cannot decrypt HKDF-encrypted data with the legacy
  // decryptor or vice versa. Switching requires re-encrypting all existing embeddings.
  let encryptedEmbedding = null;
  if (KEY_VAULT_ENABLED) {
    if (process.env.ENCRYPTION_MASTER_SECRET) {
      // New deployments: use HKDF encryption (explicit opt-in via ENCRYPTION_MASTER_SECRET)
      encryptedEmbedding = encryptViaService(Array.from(embeddingVector), firmId);
    }
    // Fallback / existing deployments: legacy encryption with ENCRYPTION_SECRET
    if (!encryptedEmbedding) {
      encryptedEmbedding = await encryptEmbeddingLegacy(embeddingVector, firmId);
    }
  }

  return {
    embedding: Array.from(embeddingVector), // Convert to regular array for pgvector
    encryptedEmbedding,
    model: data.model,
    usage: data.usage,
  };
}

/**
 * Legacy: Encrypt embedding using firm-specific key from Azure Key Vault
 * @deprecated Use encryptionService.js instead (proper HKDF key derivation)
 */
async function encryptEmbeddingLegacy(embedding, firmId) {
  if (!KEY_VAULT_ENABLED) {
    return null;
  }

  try {
    // In production: Fetch key from Azure Key Vault using firmId
    // For now, use a local key derivation function
    // TODO: Implement Azure Key Vault integration
    
    // Generate a key from firmId + secret (temporary solution)
    const keyMaterial = crypto.createHash('sha256')
      .update(firmId + process.env.ENCRYPTION_SECRET)
      .digest();
    
    const key = keyMaterial.slice(0, 32); // AES-256 key
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Convert embedding to buffer
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    
    const encrypted = Buffer.concat([
      cipher.update(embeddingBuffer),
      cipher.final(),
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Store IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  } catch (error) {
    console.error('[EmbeddingService] Encryption error:', error);
    // Don't fail if encryption fails, just store unencrypted
    return null;
  }
}

/**
 * Decrypt embedding using firm-specific key
 */
async function decryptEmbedding(encryptedData, firmId) {
  if (!encryptedData || !KEY_VAULT_ENABLED) {
    return null;
  }

  try {
    // Generate key (same as encryption)
    const keyMaterial = crypto.createHash('sha256')
      .update(firmId + process.env.ENCRYPTION_SECRET)
      .digest();
    const key = keyMaterial.slice(0, 32);
    
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');
    
    // Extract IV (16 bytes), auth tag (16 bytes), and encrypted data
    const iv = encryptedBuffer.slice(0, 16);
    const authTag = encryptedBuffer.slice(16, 32);
    const encrypted = encryptedBuffer.slice(32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    // Convert back to Float32Array
    return Array.from(new Float32Array(decrypted.buffer));
  } catch (error) {
    console.error('[EmbeddingService] Decryption error:', error);
    return null;
  }
}

/**
 * Chunk legal document text intelligently
 * Legal documents need special handling for:
 * - Sections and clauses
 * - Citation blocks
 * - Definitions
 * - Recitals
 */
export function chunkLegalDocument(text, documentType = 'legal') {
  const chunks = [];
  
  if (!text || text.trim().length === 0) {
    return chunks;
  }
  
  // Strategy 1: Split by sections (common legal document markers)
  const sectionRegex = /(?:§\s*\d+\.|\d+\.\s*[A-Z]|ARTICLE\s+\d+|SECTION\s+\d+\.\d+)/gi;
  const sectionMatches = [...text.matchAll(sectionRegex)];
  
  if (sectionMatches.length > 1) {
    // Use section boundaries
    for (let i = 0; i < sectionMatches.length; i++) {
      const startIdx = sectionMatches[i].index;
      const endIdx = i < sectionMatches.length - 1 ? sectionMatches[i + 1].index : text.length;
      const sectionText = text.substring(startIdx, endIdx).trim();
      
      if (sectionText.length > 50) {
        chunks.push({
          text: sectionText,
          chunkIndex: i,
          chunkType: 'section',
          metadata: {
            sectionMarker: sectionMatches[i][0],
            charStart: startIdx,
            charEnd: endIdx,
          }
        });
      }
    }
  } else {
    // Strategy 2: Smart paragraph splitting for legal text
    const paragraphs = text.split(/\n\s*\n+/);
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (trimmedPara.length === 0) continue;
      
      // Legal citation detection
      const citationRegex = /\d+\s+(?:U\.S\.|S\.Ct\.|F\.\s*(?:2d|3d|4th)?|U\.S\.C\.|C\.F\.R\.)/i;
      const isCitation = citationRegex.test(trimmedPara);
      
      // Definition detection  
      const definitionRegex = /^"?([A-Z][A-Za-z\s]+)"?\s+means\s+|^"?([A-Z][A-Za-z\s]+)"?\s+shall\s+mean/i;
      const isDefinition = definitionRegex.test(trimmedPara);
      
      if (currentChunk.length + trimmedPara.length > 1000 || isCitation || isDefinition) {
        // Flush current chunk
        if (currentChunk.length > 50) {
          chunks.push({
            text: currentChunk,
            chunkIndex: chunkIndex++,
            chunkType: 'paragraph',
            metadata: {
              containsCitation: citationRegex.test(currentChunk),
              containsDefinition: definitionRegex.test(currentChunk),
            }
          });
        }
        currentChunk = trimmedPara;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
      }
    }
    
    // Add last chunk
    if (currentChunk.length > 50) {
      chunks.push({
        text: currentChunk,
        chunkIndex: chunkIndex,
        chunkType: 'paragraph',
        metadata: {}
      });
    }
  }
  
  return chunks;
}

/**
 * Store document embeddings in database
 * 
 * Enhanced flow (Contextual Retrieval + RAPTOR):
 * 1. Fetch matter context for the document
 * 2. Use contextual chunker (prepends document/section metadata to each chunk)
 * 3. Embed the contextual text (not raw text) for better retrieval
 * 4. Encrypt embedding with per-tenant key
 * 5. Store in pgvector
 * 6. Build RAPTOR summary tree for long documents
 */
export async function storeDocumentEmbeddings(documentId, firmId, text, metadata = {}) {
  try {
    // Fetch document info for context enrichment
    let document = { id: documentId, name: metadata.documentName, type: metadata.documentType, created_at: metadata.createdAt };
    let matterInfo = null;
    
    try {
      const docResult = await query(`
        SELECT d.id, d.name, d.type, d.matter_id, d.created_at, d.owner_id,
               u.name as owner_name
        FROM documents d
        LEFT JOIN users u ON u.id = d.owner_id AND u.firm_id = d.firm_id
        WHERE d.id = $1 AND d.firm_id = $2
      `, [documentId, firmId]);
      
      if (docResult.rows.length > 0) {
        document = { ...document, ...docResult.rows[0] };
      }
      
      // Fetch matter context if available
      if (document.matter_id) {
        matterInfo = await getMatterContext(document.matter_id, firmId);
      }
    } catch (e) {
      console.warn('[EmbeddingService] Could not fetch document context:', e.message);
    }
    
    // Step 1: Contextual chunking (Anthropic's approach)
    // Each chunk gets document-level and section-level context prepended
    const contextualChunks = chunkWithContext(text, document, matterInfo);
    
    // Fallback to legacy chunking if contextual chunker returns nothing
    const chunks = contextualChunks.length > 0 
      ? contextualChunks 
      : chunkLegalDocument(text, metadata.documentType).map(c => ({
          ...c,
          contextualText: c.text, // No context prepended
        }));
    
    let totalTokens = 0;
    
    // Step 2: Embed and store each chunk
    for (const chunk of chunks) {
      // Embed the CONTEXTUAL text (with metadata prepended), not raw text
      const textToEmbed = chunk.contextualText || chunk.text;
      const embeddingResult = await generateEmbedding(textToEmbed, firmId);
      
      // Calculate chunk hash for deduplication (based on raw text, not contextual)
      const chunkHash = crypto.createHash('sha256')
        .update(chunk.text)
        .digest('hex');
      
      totalTokens += embeddingResult.usage?.total_tokens || 0;
      
      // Store in database (raw text stored for display, contextual text was used for embedding)
      await query(`
        INSERT INTO document_embeddings (
          firm_id, document_id, chunk_index, chunk_text, chunk_hash,
          embedding, encrypted_embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (firm_id, document_id, chunk_index) 
        DO UPDATE SET
          embedding = EXCLUDED.embedding,
          encrypted_embedding = EXCLUDED.encrypted_embedding,
          chunk_text = EXCLUDED.chunk_text,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        firmId,
        documentId,
        chunk.chunkIndex,
        chunk.text,  // Store raw text for display
        chunkHash,
        embeddingResult.embedding,
        embeddingResult.encryptedEmbedding,
        JSON.stringify({
          ...metadata,
          chunkType: chunk.chunkType || chunk.metadata?.chunkType,
          sectionMarker: chunk.sectionMarker || chunk.metadata?.sectionMarker,
          crossReferenceCount: chunk.crossReferences?.length || 0,
          contextualRetrieval: true, // Flag that this chunk was context-enriched
          documentType: chunk.metadata?.documentType || metadata.documentType,
          model: embeddingResult.model,
          tokens: embeddingResult.usage?.total_tokens || 0,
        })
      ]);
    }
    
    // Step 3: Build RAPTOR summary tree for long documents
    let raptorStats = null;
    if (chunks.length >= 16) { // Only build tree for documents with 16+ chunks
      try {
        raptorStats = await buildSummaryTree(documentId, firmId, chunks, generateEmbedding);
      } catch (e) {
        console.warn('[EmbeddingService] RAPTOR tree construction failed:', e.message);
      }
    }
    
    // Step 4: Extract and store cross-references as document relationships
    // Wrapped in try/catch: if document_relationships table doesn't exist yet, don't fail
    if (contextualChunks.length > 0) {
      try {
        await storeExtractedRelationships(documentId, firmId, contextualChunks);
      } catch (e) {
        console.warn('[EmbeddingService] Cross-reference extraction failed:', e.message);
      }
    }
    
    return {
      success: true,
      chunkCount: chunks.length,
      totalTokens,
      contextualRetrieval: contextualChunks.length > 0,
      raptorTree: raptorStats,
    };
  } catch (error) {
    console.error('[EmbeddingService] Store embeddings error:', error);
    throw error;
  }
}

/**
 * Store cross-references extracted during chunking as document relationships
 * These become edges in the knowledge graph for graph expansion retrieval
 */
async function storeExtractedRelationships(documentId, firmId, chunks) {
  const allRefs = [];
  for (const chunk of chunks) {
    if (chunk.crossReferences && chunk.crossReferences.length > 0) {
      allRefs.push(...chunk.crossReferences);
    }
  }
  
  if (allRefs.length === 0) return;
  
  // For now, store case citations as potential relationships
  // Full resolution (matching citation to actual document in the system) 
  // would require a citation resolution service
  const caseCitations = allRefs.filter(r => r.type === 'case_citation');
  
  for (const citation of caseCitations.slice(0, 20)) { // Cap at 20 per document
    try {
      // Try to find the cited document in the firm's collection
      const citedDoc = await query(`
        SELECT id FROM documents 
        WHERE firm_id = $1 
          AND (name ILIKE $2 OR name ILIKE $3)
        LIMIT 1
      `, [
        firmId, 
        `%${citation.target.substring(0, 30)}%`,
        `%${citation.context.substring(0, 30)}%`,
      ]);
      
      if (citedDoc.rows.length > 0) {
        await query(`
          INSERT INTO document_relationships (
            firm_id, source_document_id, target_document_id, 
            relationship_type, confidence, context
          ) VALUES ($1, $2, $3, 'cites', 0.8, $4)
          ON CONFLICT (firm_id, source_document_id, target_document_id, relationship_type) 
          DO UPDATE SET confidence = GREATEST(document_relationships.confidence, 0.8)
        `, [firmId, documentId, citedDoc.rows[0].id, citation.context.substring(0, 200)]);
      }
    } catch (e) {
      // Non-critical, continue with other citations
    }
  }
}

/**
 * Search for similar documents using vector similarity
 * 
 * NOTE: For full hybrid retrieval (vector + keyword + graph + RAPTOR),
 * use retrievalPipeline.js instead. This function is kept for backward
 * compatibility with existing callers.
 * 
 * @param {string} searchQuery - The search text (renamed from 'query' to avoid
 *   shadowing the imported database query function - pre-existing bug fix)
 * @param {string} firmId - The firm ID for tenant isolation
 * @param {object} options - Search options
 */
export async function semanticSearch(searchQuery, firmId, options = {}) {
  const {
    limit = 10,
    threshold = 0.7,
    matterId = null,
    documentType = null,
    includeGraphExpansion = true,
    lawyerId = null,  // Optional: for learning integration
  } = options;
  
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(searchQuery, firmId);
    
    // Vector similarity search
    const vectorResults = await query(`
      WITH ranked_results AS (
        SELECT 
          de.document_id,
          de.chunk_index,
          de.chunk_text,
          de.metadata,
          1 - (de.embedding <=> $1::vector) AS similarity,
          d.name as document_name,
          d.type as document_type,
          d.matter_id,
          m.name as matter_name
        FROM document_embeddings de
        JOIN documents d ON d.id = de.document_id AND d.firm_id = de.firm_id
        LEFT JOIN matters m ON m.id = d.matter_id AND m.firm_id = d.firm_id
        WHERE de.firm_id = $2
          AND ($3::UUID IS NULL OR d.matter_id = $3)
          AND ($4::VARCHAR IS NULL OR d.type = $4)
          AND 1 - (de.embedding <=> $1::vector) >= $5
        ORDER BY similarity DESC
        LIMIT $6
      )
      SELECT * FROM ranked_results
    `, [
      queryEmbedding.embedding,
      firmId,
      matterId,
      documentType,
      threshold,
      limit * 2, // Get extra for graph expansion
    ]);
    
    let results = vectorResults.rows;
    
    // Graph expansion for legal documents
    if (includeGraphExpansion && results.length > 0) {
      const documentIds = results.map(r => r.document_id);
      const graphResults = await query(`
        SELECT DISTINCT
          dr.target_document_id as document_id,
          d.name as document_name,
          d.type as document_type,
          d.matter_id,
          m.name as matter_name,
          'graph_expansion' as source,
          dr.relationship_type,
          dr.confidence
        FROM document_relationships dr
        JOIN documents d ON d.id = dr.target_document_id AND d.firm_id = dr.firm_id
        LEFT JOIN matters m ON m.id = d.matter_id AND m.firm_id = d.firm_id
        WHERE dr.firm_id = $1
          AND dr.source_document_id = ANY($2::UUID[])
          AND dr.confidence >= 0.5
          AND dr.relationship_type IN ('cites', 'references', 'similar_to')
        ORDER BY dr.confidence DESC
        LIMIT $3
      `, [firmId, documentIds, limit]);
      
      // Add graph results (deduplicate)
      const existingIds = new Set(results.map(r => r.document_id));
      for (const graphResult of graphResults.rows) {
        if (!existingIds.has(graphResult.document_id)) {
          results.push({
            ...graphResult,
            similarity: 0.6 * graphResult.confidence, // Convert confidence to similarity score
            chunk_index: 0,
            chunk_text: '[Graph relationship: ' + graphResult.relationship_type + ']',
          });
        }
      }
    }
    
    // Apply lawyer preferences weighting if available
    const weightedResults = await applyLawyerPreferences(results, firmId, options.lawyerId || options.userId);
    
    // Return top N results
    return weightedResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(r => ({
        documentId: r.document_id,
        documentName: r.document_name,
        matterId: r.matter_id,
        matterName: r.matter_name,
        similarity: r.similarity,
        chunkText: r.chunk_text.substring(0, 500) + '...',
        source: r.source || 'vector',
        relationshipType: r.relationship_type,
        confidence: r.confidence,
      }));
  } catch (error) {
    console.error('[EmbeddingService] Semantic search error:', error);
    throw error;
  }
}

/**
 * Apply lawyer preferences to search results
 */
async function applyLawyerPreferences(results, firmId, lawyerId) {
  if (!lawyerId) {
    return results;
  }
  
  try {
    // Get lawyer preferences for document types and matters
    const preferences = await query(`
      SELECT preference_key, preference_value, confidence
      FROM lawyer_preferences
      WHERE firm_id = $1 AND lawyer_id = $2
        AND preference_type IN ('document_type_preference', 'matter_type_preference')
    `, [firmId, lawyerId]);
    
    const preferenceMap = {};
    for (const pref of preferences.rows) {
      preferenceMap[pref.preference_key] = {
        value: pref.preference_value,
        confidence: pref.confidence,
      };
    }
    
    // Apply weighting
    return results.map(result => {
      let weight = 1.0;
      
      // Document type preference
      if (result.document_type && preferenceMap[`doc_type_${result.document_type}`]) {
        const pref = preferenceMap[`doc_type_${result.document_type}`];
        weight += 0.3 * pref.confidence; // Boost preferred types
      }
      
      // Matter type preference
      if (result.matter_name) {
        // Check if matter name contains preferred keywords
        for (const [key, pref] of Object.entries(preferenceMap)) {
          if (key.startsWith('matter_type_')) {
            const matterType = key.replace('matter_type_', '');
            if (result.matter_name.toLowerCase().includes(matterType.toLowerCase())) {
              weight += 0.2 * pref.confidence;
            }
          }
        }
      }
      
      return {
        ...result,
        similarity: result.similarity * weight,
        preferenceWeight: weight,
      };
    });
  } catch (error) {
    console.error('[EmbeddingService] Preference weighting error:', error);
    return results; // Return unweighted results on error
  }
}

/**
 * Delete embeddings for a document
 */
export async function deleteDocumentEmbeddings(documentId, firmId) {
  try {
    await query(`
      DELETE FROM document_embeddings
      WHERE firm_id = $1 AND document_id = $2
    `, [firmId, documentId]);
    
    return { success: true };
  } catch (error) {
    console.error('[EmbeddingService] Delete embeddings error:', error);
    throw error;
  }
}

/**
 * Get embedding statistics for a firm
 */
export async function getEmbeddingStats(firmId) {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(DISTINCT document_id) as total_documents,
        AVG(array_length(embedding, 1)) as avg_dimensions,
        MIN(created_at) as oldest_embedding,
        MAX(created_at) as newest_embedding
      FROM document_embeddings
      WHERE firm_id = $1
    `, [firmId]);
    
    return result.rows[0] || {
      total_chunks: 0,
      total_documents: 0,
      avg_dimensions: 0,
      oldest_embedding: null,
      newest_embedding: null,
    };
  } catch (error) {
    console.error('[EmbeddingService] Get stats error:', error);
    return {
      total_chunks: 0,
      total_documents: 0,
      avg_dimensions: 0,
      oldest_embedding: null,
      newest_embedding: null,
    };
  }
}

/**
 * Delete embeddings AND summary tree for a document
 * Safe to call even if new tables (document_summary_tree) don't exist yet
 */
export async function deleteDocumentWithTree(documentId, firmId) {
  try {
    // Delete RAPTOR summary tree (safe: table may not exist if migration hasn't run)
    try {
      await query(`
        DELETE FROM document_summary_tree
        WHERE firm_id = $1 AND document_id = $2
      `, [firmId, documentId]);
    } catch (e) {
      // Table may not exist yet - non-critical
      console.warn('[EmbeddingService] Summary tree delete skipped:', e.message);
    }
    
    // Delete embeddings (core table, always exists)
    await deleteDocumentEmbeddings(documentId, firmId);
    
    // Delete relationships (table from add_vector_embedding_support.sql)
    try {
      await query(`
        DELETE FROM document_relationships
        WHERE firm_id = $1 AND (source_document_id = $2 OR target_document_id = $2)
      `, [firmId, documentId]);
    } catch (e) {
      console.warn('[EmbeddingService] Relationship delete skipped:', e.message);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[EmbeddingService] Delete with tree error:', error);
    throw error;
  }
}

export default {
  generateEmbedding,
  chunkLegalDocument,
  storeDocumentEmbeddings,
  semanticSearch,
  deleteDocumentEmbeddings,
  deleteDocumentWithTree,
  getEmbeddingStats,
};
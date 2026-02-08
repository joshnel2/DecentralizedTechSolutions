/**
 * Resonance Memory - A Living Cognitive Graph
 * 
 * ═══════════════════════════════════════════════════════════════════
 * THIS IS NOT A DATABASE. THIS IS A BRAIN.
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Every AI memory system today works like a library: store information,
 * organize it on shelves, retrieve the right book when needed. That's
 * what the existing modules do — identity, exemplars, replays, etc. are
 * all independent shelves that get assembled at prompt time.
 * 
 * Human memory doesn't work like a library. It works like a NETWORK.
 * When you learn something new, it doesn't get filed away — it actively
 * REWIRES connections between everything you already know. New learning
 * changes the meaning of old memories. Old memories shape how new
 * information is stored. It's bidirectional and continuous.
 * 
 * Resonance Memory implements this for the amplifier harness.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════
 * 
 * The graph has two types of entities:
 * 
 * NODES: References to memories in existing tables. Each node has a
 *   TYPE (identity, exemplar, replay, association, edit_signal, etc.),
 *   a CHARGE (0.0-1.0, its current influence strength), and a
 *   reference to its source record.
 * 
 * EDGES: Weighted connections between nodes. Each edge has a
 *   WEIGHT (how strongly the nodes are related), a TYPE (reinforces,
 *   contradicts, co_occurred, same_dimension), and a decay rate.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * PROPAGATION (the core innovation)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * When an event occurs (approval, rejection, edit, new task, etc.):
 * 
 * 1. ACTIVATE: The directly affected nodes get a charge boost/reduction
 * 2. PROPAGATE: Each affected node sends (delta * edge_weight) to its
 *    neighbors. Those neighbors propagate to THEIR neighbors, decaying
 *    at each hop.
 * 3. CONVERGE: Propagation stops when delta falls below threshold
 *    (typically 2-3 hops — just like real neural activation).
 * 4. PERSIST: Updated charges are saved for next load.
 * 
 * This means ONE rejection event ripples through the entire network:
 * - Correction principles get boosted
 * - Related exemplars get re-ranked  
 * - Connected identity dimensions shift
 * - Associated replays adjust their match scores
 * - The cognitive signature recalibrates
 * 
 * ═══════════════════════════════════════════════════════════════════
 * INTEGRATION WITH AMPLIFIER
 * ═══════════════════════════════════════════════════════════════════
 * 
 * At task start: loadGraph(userId, firmId) → builds in-memory graph
 * During prompt: renderForPrompt(goal, workType) → graph-aware output
 * At task end: propagateEvent('task_complete', data)
 * At approval: propagateEvent('approved', data)  
 * At rejection: propagateEvent('rejected', data)
 * At edit: propagateEvent('document_edited', data)
 * 
 * The graph REPLACES the scattered loading in initializeContext().
 * Instead of 10+ independent DB queries that don't talk to each other,
 * ONE graph load that understands how everything is connected.
 * 
 * PRIVACY: Entire graph scoped to user_id + firm_id. Never shared.
 */

import { query } from '../../db/connection.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

const MAX_NODES = 300;                  // Max nodes per attorney graph
const MAX_EDGES_PER_NODE = 15;         // Connection limit
const PROPAGATION_DECAY = 0.4;         // Signal loses 60% per hop
const PROPAGATION_THRESHOLD = 0.01;    // Stop propagating below this
const MAX_PROPAGATION_HOPS = 3;        // Max depth of propagation
const CHARGE_MIN = 0.01;
const CHARGE_MAX = 1.0;
const DEFAULT_CHARGE = 0.5;
const GRAPH_CACHE_TTL_MS = 300000;     // 5 minutes

// Node types (map to existing tables)
export const NodeType = {
  IDENTITY_DIM:    'identity_dim',      // attorney_identity_dimensions
  EXEMPLAR:        'exemplar',          // attorney_exemplars
  CORRECTION:      'correction',        // attorney_exemplars (correction type)
  REPLAY:          'replay',            // identity_replays
  ASSOCIATION:     'association',        // associative_memory_edges
  EDIT_SIGNAL:     'edit_signal',       // edit_diff_signals
  QUALITY_RULE:    'quality_rule',      // harness_quality_overrides
  TOOL_CHAIN:      'tool_chain',        // proven_tool_chains
  MATTER_MEMORY:   'matter_memory',     // matter_agent_memory
  COG_SIG_DIM:     'cog_sig_dim',       // cognitive_signatures (per-dimension)
  LEARNING:        'learning',          // ai_learning_patterns
  PRINCIPLE:       'principle',         // correction_principle from identity
};

// Edge types
export const EdgeType = {
  REINFORCES:      'reinforces',        // One memory supports another
  CONTRADICTS:     'contradicts',       // One memory conflicts with another
  SAME_DIMENSION:  'same_dimension',    // Both affect the same cognitive dimension
  CO_OCCURRED:     'co_occurred',       // Observed in the same task/context
  DERIVED_FROM:    'derived_from',      // One was learned from the other's event
};

// Event types that trigger propagation
export const EventType = {
  TASK_COMPLETE:   'task_complete',
  APPROVED:        'approved',
  REJECTED:        'rejected',
  DOCUMENT_EDITED: 'document_edited',
  FEEDBACK:        'feedback',
};

// Graph cache
const graphCache = new Map();

// Auto-migration
let _tableEnsured = false;
async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    // The resonance graph: nodes + edges + charges in one efficient table
    await query(`
      CREATE TABLE IF NOT EXISTS resonance_graph (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        
        -- Node A
        node_a_type VARCHAR(30) NOT NULL,
        node_a_ref VARCHAR(200) NOT NULL,     -- reference key (ID or dimension name)
        node_a_charge DECIMAL(4,3) DEFAULT 0.500,
        
        -- Node B  
        node_b_type VARCHAR(30) NOT NULL,
        node_b_ref VARCHAR(200) NOT NULL,
        node_b_charge DECIMAL(4,3) DEFAULT 0.500,
        
        -- Edge
        edge_type VARCHAR(30) NOT NULL,
        edge_weight DECIMAL(4,3) DEFAULT 0.500,
        
        -- Metadata
        context VARCHAR(100),                  -- work_type or matter_type that created this
        observation_count INTEGER DEFAULT 1,
        
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        
        UNIQUE(user_id, firm_id, node_a_type, node_a_ref, node_b_type, node_b_ref, edge_type)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_resonance_user ON resonance_graph(user_id, firm_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_resonance_node_a ON resonance_graph(user_id, firm_id, node_a_type, node_a_ref)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_resonance_node_b ON resonance_graph(user_id, firm_id, node_b_type, node_b_ref)`);
    
    // Separate charge table for fast reads (charges change more often than edges)
    await query(`
      CREATE TABLE IF NOT EXISTS resonance_charges (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        node_type VARCHAR(30) NOT NULL,
        node_ref VARCHAR(200) NOT NULL,
        charge DECIMAL(4,3) DEFAULT 0.500,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, firm_id, node_type, node_ref)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_resonance_charges_user ON resonance_charges(user_id, firm_id)`);
  } catch (e) {
    if (!e.message?.includes('already exists')) {
      console.log('[ResonanceMemory] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// THE GRAPH: In-memory representation loaded per-attorney
// =====================================================================

/**
 * In-memory graph for one attorney. Loaded at task start, updated
 * during execution, persisted on events.
 */
export class ResonanceGraph {
  constructor(userId, firmId) {
    this.userId = userId;
    this.firmId = firmId;
    
    // Adjacency list: nodeKey -> { type, ref, charge, edges: [{ targetKey, edgeType, weight }] }
    this.nodes = new Map();
    
    // Fast lookup: nodeKey -> charge (for propagation)
    this.charges = new Map();
    
    // Dirty tracking for persistence
    this.dirtyCharges = new Set();
    this.dirtyEdges = new Set();
    
    this.loaded = false;
  }
  
  // ===== NODE MANAGEMENT =====
  
  _nodeKey(type, ref) {
    return `${type}:${ref}`;
  }
  
  addNode(type, ref, charge = DEFAULT_CHARGE) {
    const key = this._nodeKey(type, ref);
    if (!this.nodes.has(key)) {
      this.nodes.set(key, { type, ref, charge, edges: [] });
      this.charges.set(key, charge);
    }
    return key;
  }
  
  addEdge(typeA, refA, typeB, refB, edgeType, weight = 0.5) {
    const keyA = this._nodeKey(typeA, refA);
    const keyB = this._nodeKey(typeB, refB);
    
    // Ensure both nodes exist
    this.addNode(typeA, refA);
    this.addNode(typeB, refB);
    
    const nodeA = this.nodes.get(keyA);
    const nodeB = this.nodes.get(keyB);
    
    // Add bidirectional edges (skip if already exists)
    if (!nodeA.edges.some(e => e.targetKey === keyB && e.edgeType === edgeType)) {
      nodeA.edges.push({ targetKey: keyB, edgeType, weight });
    }
    if (!nodeB.edges.some(e => e.targetKey === keyA && e.edgeType === edgeType)) {
      nodeB.edges.push({ targetKey: keyA, edgeType, weight });
    }
    
    this.dirtyEdges.add(`${keyA}|${keyB}|${edgeType}`);
  }
  
  getCharge(type, ref) {
    return this.charges.get(this._nodeKey(type, ref)) || DEFAULT_CHARGE;
  }
  
  // ===== PROPAGATION: The heart of resonance =====
  
  /**
   * Propagate a charge change through the graph.
   * 
   * @param {string} type - Node type that was activated
   * @param {string} ref - Node reference
   * @param {number} delta - Charge change (+boost or -reduction)
   * @param {string} reason - Why this propagation is happening
   * @returns {object} { nodesAffected, hops, totalDelta }
   */
  propagate(type, ref, delta, reason = '') {
    const startKey = this._nodeKey(type, ref);
    const startNode = this.nodes.get(startKey);
    if (!startNode) return { nodesAffected: 0, hops: 0, totalDelta: 0 };
    
    // Apply delta to the source node
    const newCharge = Math.max(CHARGE_MIN, Math.min(CHARGE_MAX, startNode.charge + delta));
    startNode.charge = newCharge;
    this.charges.set(startKey, newCharge);
    this.dirtyCharges.add(startKey);
    
    // BFS propagation with decay
    const visited = new Set([startKey]);
    let frontier = [{ key: startKey, delta }];
    let nodesAffected = 1;
    let totalDelta = Math.abs(delta);
    let hops = 0;
    
    while (frontier.length > 0 && hops < MAX_PROPAGATION_HOPS) {
      hops++;
      const nextFrontier = [];
      
      for (const { key, delta: incomingDelta } of frontier) {
        const node = this.nodes.get(key);
        if (!node) continue;
        
        for (const edge of node.edges) {
          if (visited.has(edge.targetKey)) continue;
          visited.add(edge.targetKey);
          
          const targetNode = this.nodes.get(edge.targetKey);
          if (!targetNode) continue;
          
          // Calculate propagated delta
          let propagatedDelta = incomingDelta * edge.weight * PROPAGATION_DECAY;
          
          // Contradiction edges INVERT the delta
          if (edge.edgeType === EdgeType.CONTRADICTS) {
            propagatedDelta = -propagatedDelta;
          }
          
          // Skip if below threshold
          if (Math.abs(propagatedDelta) < PROPAGATION_THRESHOLD) continue;
          
          // Apply to target node
          const targetCharge = Math.max(CHARGE_MIN, Math.min(CHARGE_MAX, targetNode.charge + propagatedDelta));
          targetNode.charge = targetCharge;
          this.charges.set(edge.targetKey, targetCharge);
          this.dirtyCharges.add(edge.targetKey);
          
          nodesAffected++;
          totalDelta += Math.abs(propagatedDelta);
          
          nextFrontier.push({ key: edge.targetKey, delta: propagatedDelta });
        }
      }
      
      frontier = nextFrontier;
    }
    
    console.log(`[ResonanceMemory] Propagation from ${type}:${ref} (delta=${delta.toFixed(3)}): ${nodesAffected} nodes affected over ${hops} hops, total delta=${totalDelta.toFixed(3)}, reason: ${reason}`);
    
    return { nodesAffected, hops, totalDelta };
  }
  
  // ===== EVENT HANDLING: What happens when things occur =====
  
  /**
   * Process an event and propagate its effects through the graph.
   */
  processEvent(eventType, eventData = {}) {
    switch (eventType) {
      case EventType.APPROVED: {
        // Boost everything that contributed to this approved task
        const { workType, taskId, evaluationScore } = eventData;
        const boostMagnitude = evaluationScore ? (evaluationScore / 100) * 0.15 : 0.10;
        
        // Boost tool chain
        if (workType) {
          this.propagate(NodeType.TOOL_CHAIN, workType, boostMagnitude, 'task approved');
        }
        
        // Boost all identity dimensions (approved = identity was correct)
        for (const [key, node] of this.nodes) {
          if (node.type === NodeType.IDENTITY_DIM || node.type === NodeType.PRINCIPLE) {
            this.propagate(node.type, node.ref, boostMagnitude * 0.5, 'identity validated by approval');
          }
        }
        
        // Boost relevant exemplars and replays
        if (workType) {
          for (const [key, node] of this.nodes) {
            if ((node.type === NodeType.EXEMPLAR || node.type === NodeType.REPLAY) && node.ref.includes(workType)) {
              this.propagate(node.type, node.ref, boostMagnitude * 0.3, 'exemplar/replay validated');
            }
          }
        }
        break;
      }
      
      case EventType.REJECTED: {
        // Weaken what led to rejected output, boost corrections
        const { workType, feedback } = eventData;
        
        // Weaken the tool chain that was used
        if (workType) {
          this.propagate(NodeType.TOOL_CHAIN, workType, -0.10, 'task rejected');
        }
        
        // Boost correction/principle nodes (they become more important)
        for (const [key, node] of this.nodes) {
          if (node.type === NodeType.CORRECTION || node.type === NodeType.QUALITY_RULE) {
            this.propagate(node.type, node.ref, 0.08, 'corrections reinforced after rejection');
          }
        }
        break;
      }
      
      case EventType.DOCUMENT_EDITED: {
        // Edit signals are high-confidence corrections
        const { dimension, signalType } = eventData;
        
        if (dimension) {
          // Boost the edit signal's connected identity dimensions
          this.propagate(NodeType.EDIT_SIGNAL, dimension, 0.12, 'attorney edited document');
          
          // Find and boost same-dimension identity nodes
          for (const [key, node] of this.nodes) {
            if (node.type === NodeType.IDENTITY_DIM && node.ref.includes(dimension)) {
              this.propagate(node.type, node.ref, 0.08, 'identity dimension updated from edit');
            }
          }
        }
        break;
      }
      
      case EventType.TASK_COMPLETE: {
        // Mild boost to everything that was loaded for this task
        const { workType } = eventData;
        if (workType) {
          this.propagate(NodeType.TOOL_CHAIN, workType, 0.03, 'task completed');
        }
        break;
      }
      
      case EventType.FEEDBACK: {
        const { rating } = eventData;
        if (rating >= 4) {
          // Positive feedback boosts current configuration
          for (const [key, node] of this.nodes) {
            if (node.type === NodeType.IDENTITY_DIM && node.charge > 0.5) {
              node.charge = Math.min(CHARGE_MAX, node.charge + 0.02);
              this.charges.set(key, node.charge);
              this.dirtyCharges.add(key);
            }
          }
        }
        break;
      }
    }
  }
  
  // ===== QUERYING: Get the most activated nodes for prompt building =====
  
  /**
   * Get the top-N most activated (highest charge) nodes of a given type.
   */
  getTopNodes(type, limit = 10) {
    const nodes = [];
    for (const [key, node] of this.nodes) {
      if (node.type === type) {
        nodes.push({ key, ...node });
      }
    }
    return nodes.sort((a, b) => b.charge - a.charge).slice(0, limit);
  }
  
  /**
   * Get all nodes connected to a given node, sorted by charge * edge weight.
   */
  getConnected(type, ref) {
    const key = this._nodeKey(type, ref);
    const node = this.nodes.get(key);
    if (!node) return [];
    
    return node.edges
      .map(e => {
        const target = this.nodes.get(e.targetKey);
        return target ? { ...target, key: e.targetKey, edgeType: e.edgeType, edgeWeight: e.weight, score: target.charge * e.weight } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }
  
  /**
   * Get a charge-weighted summary of the entire graph.
   * Used for the maturity/health display.
   */
  getSummary() {
    const byType = {};
    for (const [key, node] of this.nodes) {
      if (!byType[node.type]) byType[node.type] = { count: 0, avgCharge: 0, totalCharge: 0 };
      byType[node.type].count++;
      byType[node.type].totalCharge += node.charge;
    }
    for (const type of Object.keys(byType)) {
      byType[type].avgCharge = byType[type].count > 0 ? byType[type].totalCharge / byType[type].count : 0;
    }
    
    let totalEdges = 0;
    for (const [, node] of this.nodes) {
      totalEdges += node.edges.length;
    }
    
    return {
      totalNodes: this.nodes.size,
      totalEdges: totalEdges / 2, // Bidirectional, so /2
      byType,
      dirtyCharges: this.dirtyCharges.size,
    };
  }
  
  // ===== PERSISTENCE =====
  
  /**
   * Persist dirty charges and edges to database.
   */
  async persist() {
    if (this.dirtyCharges.size === 0 && this.dirtyEdges.size === 0) return;
    
    try {
      // Batch persist charges
      for (const key of this.dirtyCharges) {
        const node = this.nodes.get(key);
        if (!node) continue;
        
        await query(`
          INSERT INTO resonance_charges (user_id, firm_id, node_type, node_ref, charge)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, firm_id, node_type, node_ref)
          DO UPDATE SET charge = $5, updated_at = NOW()
        `, [this.userId, this.firmId, node.type, node.ref, node.charge]);
      }
      
      // Batch persist edges
      for (const edgeKey of this.dirtyEdges) {
        const [keyA, keyB, edgeType] = edgeKey.split('|');
        const nodeA = this.nodes.get(keyA);
        const nodeB = this.nodes.get(keyB);
        if (!nodeA || !nodeB) continue;
        
        const edge = nodeA.edges.find(e => e.targetKey === keyB && e.edgeType === edgeType);
        if (!edge) continue;
        
        await query(`
          INSERT INTO resonance_graph 
            (user_id, firm_id, node_a_type, node_a_ref, node_a_charge, node_b_type, node_b_ref, node_b_charge, edge_type, edge_weight)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (user_id, firm_id, node_a_type, node_a_ref, node_b_type, node_b_ref, edge_type)
          DO UPDATE SET 
            node_a_charge = $5, node_b_charge = $8, edge_weight = $10,
            observation_count = resonance_graph.observation_count + 1,
            updated_at = NOW()
        `, [
          this.userId, this.firmId,
          nodeA.type, nodeA.ref, nodeA.charge,
          nodeB.type, nodeB.ref, nodeB.charge,
          edgeType, edge.weight,
        ]);
      }
      
      this.dirtyCharges.clear();
      this.dirtyEdges.clear();
    } catch (e) {
      console.log('[ResonanceMemory] Persist note:', e.message);
    }
  }
}

// =====================================================================
// GRAPH LOADING: Build the graph from all existing memory systems
// =====================================================================

/**
 * Load or build the resonance graph for an attorney.
 * This is called at task start in initializeContext().
 * 
 * It pulls from ALL existing memory tables and wires them together
 * into a single connected graph.
 */
export async function loadResonanceGraph(userId, firmId, context = {}) {
  // Check cache
  const cacheKey = `${userId}:${firmId}`;
  const cached = graphCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < GRAPH_CACHE_TTL_MS) {
    return cached.graph;
  }
  
  await _ensureTable();
  
  const graph = new ResonanceGraph(userId, firmId);
  
  try {
    // 1. Load persisted charges (from previous sessions)
    const chargeResult = await query(`
      SELECT node_type, node_ref, charge FROM resonance_charges
      WHERE user_id = $1 AND firm_id = $2
    `, [userId, firmId]);
    
    const persistedCharges = new Map();
    for (const row of chargeResult.rows) {
      persistedCharges.set(`${row.node_type}:${row.node_ref}`, parseFloat(row.charge));
    }
    
    // 2. Load persisted edges
    const edgeResult = await query(`
      SELECT node_a_type, node_a_ref, node_b_type, node_b_ref, edge_type, edge_weight
      FROM resonance_graph
      WHERE user_id = $1 AND firm_id = $2
      ORDER BY updated_at DESC
      LIMIT $3
    `, [userId, firmId, MAX_NODES * MAX_EDGES_PER_NODE]);
    
    for (const row of edgeResult.rows) {
      const chargeA = persistedCharges.get(`${row.node_a_type}:${row.node_a_ref}`) || DEFAULT_CHARGE;
      const chargeB = persistedCharges.get(`${row.node_b_type}:${row.node_b_ref}`) || DEFAULT_CHARGE;
      
      graph.addNode(row.node_a_type, row.node_a_ref, chargeA);
      graph.addNode(row.node_b_type, row.node_b_ref, chargeB);
      graph.addEdge(row.node_a_type, row.node_a_ref, row.node_b_type, row.node_b_ref, row.edge_type, parseFloat(row.edge_weight));
    }
    
    // 3. Hydrate from existing memory systems (create nodes for anything not yet in graph)
    await _hydrateFromIdentity(graph, userId, firmId, persistedCharges);
    await _hydrateFromExemplars(graph, userId, firmId, persistedCharges);
    await _hydrateFromAssociations(graph, userId, firmId, persistedCharges);
    await _hydrateFromEditSignals(graph, userId, firmId, persistedCharges);
    await _hydrateFromQualityRules(graph, userId, firmId, persistedCharges);
    
    // 4. Wire cross-system connections (the edges that make resonance work)
    _wireResonanceEdges(graph);
    
    graph.loaded = true;
    
    // Cache
    graphCache.set(cacheKey, { graph, timestamp: Date.now() });
    
    const summary = graph.getSummary();
    console.log(`[ResonanceMemory] Graph loaded for ${userId}: ${summary.totalNodes} nodes, ${summary.totalEdges} edges`);
    
    return graph;
  } catch (e) {
    console.log('[ResonanceMemory] Graph load note:', e.message);
    graph.loaded = false;
    return graph;
  }
}

// =====================================================================
// HYDRATION: Pull nodes from existing memory tables
// =====================================================================

async function _hydrateFromIdentity(graph, userId, firmId, persistedCharges) {
  try {
    const result = await query(`
      SELECT dimension_name, dimension_value, confidence, evidence_count
      FROM attorney_identity_dimensions
      WHERE user_id = $1 AND firm_id = $2 AND confidence > 0.3
      ORDER BY confidence DESC LIMIT 30
    `, [userId, firmId]);
    
    for (const row of result.rows) {
      const ref = row.dimension_name;
      const charge = persistedCharges.get(`${NodeType.IDENTITY_DIM}:${ref}`) || parseFloat(row.confidence);
      graph.addNode(NodeType.IDENTITY_DIM, ref, charge);
      
      // Correction principles get their own node type
      if (row.dimension_name === 'correction_principle') {
        const val = typeof row.dimension_value === 'string' ? JSON.parse(row.dimension_value) : row.dimension_value;
        const principleRef = (val.principle || '').substring(0, 80);
        if (principleRef) {
          const pCharge = persistedCharges.get(`${NodeType.PRINCIPLE}:${principleRef}`) || parseFloat(row.confidence);
          graph.addNode(NodeType.PRINCIPLE, principleRef, pCharge);
          graph.addEdge(NodeType.IDENTITY_DIM, ref, NodeType.PRINCIPLE, principleRef, EdgeType.DERIVED_FROM, 0.8);
        }
      }
    }
  } catch (_) {}
}

async function _hydrateFromExemplars(graph, userId, firmId, persistedCharges) {
  try {
    const result = await query(`
      SELECT id, exemplar_type, work_type, confidence
      FROM attorney_exemplars
      WHERE user_id = $1 AND firm_id = $2
      ORDER BY confidence DESC, created_at DESC LIMIT 20
    `, [userId, firmId]);
    
    for (const row of result.rows) {
      const nodeType = row.exemplar_type === 'correction' ? NodeType.CORRECTION : NodeType.EXEMPLAR;
      const ref = `${row.work_type || 'general'}:${row.id.substring(0, 8)}`;
      const charge = persistedCharges.get(`${nodeType}:${ref}`) || parseFloat(row.confidence);
      graph.addNode(nodeType, ref, charge);
    }
  } catch (_) {}
}

async function _hydrateFromAssociations(graph, userId, firmId, persistedCharges) {
  try {
    const result = await query(`
      SELECT source_concept, target_concept, strength, association_type
      FROM associative_memory_edges
      WHERE user_id = $1 AND firm_id = $2 AND strength >= 0.40
      ORDER BY strength DESC LIMIT 30
    `, [userId, firmId]);
    
    for (const row of result.rows) {
      const ref = `${row.source_concept}->${row.target_concept}`;
      const charge = persistedCharges.get(`${NodeType.ASSOCIATION}:${ref}`) || parseFloat(row.strength);
      graph.addNode(NodeType.ASSOCIATION, ref, charge);
    }
  } catch (_) {}
}

async function _hydrateFromEditSignals(graph, userId, firmId, persistedCharges) {
  try {
    const result = await query(`
      SELECT identity_dimension, extracted_principle, confidence
      FROM edit_diff_signals
      WHERE user_id = $1 AND firm_id = $2 AND confidence >= 0.80
      ORDER BY confidence DESC, created_at DESC LIMIT 15
    `, [userId, firmId]);
    
    for (const row of result.rows) {
      const ref = `${row.identity_dimension}:${(row.extracted_principle || '').substring(0, 40)}`;
      const charge = persistedCharges.get(`${NodeType.EDIT_SIGNAL}:${ref}`) || parseFloat(row.confidence);
      graph.addNode(NodeType.EDIT_SIGNAL, ref, charge);
    }
  } catch (_) {}
}

async function _hydrateFromQualityRules(graph, userId, firmId, persistedCharges) {
  try {
    const result = await query(`
      SELECT rule_type, work_type, reason
      FROM harness_quality_overrides
      WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL) AND is_active = true
      ORDER BY applied_count DESC LIMIT 10
    `, [firmId, userId]);
    
    for (const row of result.rows) {
      const ref = `${row.rule_type}:${row.work_type}`;
      const charge = persistedCharges.get(`${NodeType.QUALITY_RULE}:${ref}`) || 0.7;
      graph.addNode(NodeType.QUALITY_RULE, ref, charge);
    }
  } catch (_) {}
}

// =====================================================================
// WIRING: Connect nodes across systems (the resonance network)
// =====================================================================

/**
 * Wire the cross-system edges that enable resonance propagation.
 * This is where the magic happens — isolated memories become a network.
 */
function _wireResonanceEdges(graph) {
  const nodes = [...graph.nodes.entries()];
  
  // 1. Connect identity dimensions to edit signals that affect the same dimension
  const identityNodes = nodes.filter(([, n]) => n.type === NodeType.IDENTITY_DIM);
  const editNodes = nodes.filter(([, n]) => n.type === NodeType.EDIT_SIGNAL);
  
  for (const [, idNode] of identityNodes) {
    for (const [, editNode] of editNodes) {
      // If the edit signal's ref contains the identity dimension name
      if (editNode.ref.includes(idNode.ref) || idNode.ref.includes(editNode.ref.split(':')[0])) {
        graph.addEdge(idNode.type, idNode.ref, editNode.type, editNode.ref, EdgeType.SAME_DIMENSION, 0.7);
      }
    }
  }
  
  // 2. Connect correction principles to quality rules (both come from rejections)
  const principleNodes = nodes.filter(([, n]) => n.type === NodeType.PRINCIPLE);
  const qualityNodes = nodes.filter(([, n]) => n.type === NodeType.QUALITY_RULE);
  
  for (const [, pNode] of principleNodes) {
    for (const [, qNode] of qualityNodes) {
      graph.addEdge(pNode.type, pNode.ref, qNode.type, qNode.ref, EdgeType.CO_OCCURRED, 0.6);
    }
  }
  
  // 3. Connect exemplars to identity dimensions (exemplars demonstrate identity)
  const exemplarNodes = nodes.filter(([, n]) => n.type === NodeType.EXEMPLAR);
  for (const [, exNode] of exemplarNodes) {
    // Connect to all identity dimensions (exemplars embody the full identity)
    for (const [, idNode] of identityNodes.slice(0, 5)) {
      graph.addEdge(exNode.type, exNode.ref, idNode.type, idNode.ref, EdgeType.REINFORCES, 0.4);
    }
  }
  
  // 4. Connect corrections to identity dimensions (corrections RESHAPE identity)
  const correctionNodes = nodes.filter(([, n]) => n.type === NodeType.CORRECTION);
  for (const [, corrNode] of correctionNodes) {
    for (const [, idNode] of identityNodes.slice(0, 5)) {
      graph.addEdge(corrNode.type, corrNode.ref, idNode.type, idNode.ref, EdgeType.DERIVED_FROM, 0.6);
    }
  }
  
  // 5. Connect associations to each other (clusters of related reasoning)
  const assocNodes = nodes.filter(([, n]) => n.type === NodeType.ASSOCIATION);
  for (let i = 0; i < assocNodes.length; i++) {
    for (let j = i + 1; j < assocNodes.length && j < i + 5; j++) {
      const refA = assocNodes[i][1].ref;
      const refB = assocNodes[j][1].ref;
      // Connect if they share a concept
      const conceptsA = refA.split('->');
      const conceptsB = refB.split('->');
      const shared = conceptsA.some(c => conceptsB.includes(c));
      if (shared) {
        graph.addEdge(assocNodes[i][1].type, assocNodes[i][1].ref, assocNodes[j][1].type, assocNodes[j][1].ref, EdgeType.CO_OCCURRED, 0.5);
      }
    }
  }
}

// =====================================================================
// RENDERING: Generate prompt content from graph state
// =====================================================================

/**
 * Render the graph's current state as prompt text.
 * Replaces the scattered prompt building with a single, charge-weighted output.
 * 
 * High-charge nodes get more prompt space. Low-charge nodes get trimmed.
 * This is how the graph "speaks" to the model.
 */
export function renderGraphForPrompt(graph, maxChars = 2000) {
  if (!graph || !graph.loaded || graph.nodes.size === 0) return '';
  
  const sections = [];
  let charCount = 0;
  
  // Collect all nodes sorted by charge (highest first)
  const allNodes = [...graph.nodes.values()]
    .filter(n => n.charge > 0.3) // Only include meaningfully charged nodes
    .sort((a, b) => b.charge - a.charge);
  
  if (allNodes.length === 0) return '';
  
  sections.push(`\n## RESONANCE MEMORY (${allNodes.length} active nodes)`);
  charCount += 50;
  
  // High-charge principles (from corrections + edits)
  const principles = allNodes.filter(n => n.type === NodeType.PRINCIPLE || n.type === NodeType.EDIT_SIGNAL);
  if (principles.length > 0) {
    let s = `**Critical Rules (learned from corrections & edits):**\n`;
    for (const p of principles.slice(0, 5)) {
      const line = `- [${Math.round(p.charge * 100)}%] ${p.ref}\n`;
      if (charCount + line.length > maxChars) break;
      s += line;
      charCount += line.length;
    }
    sections.push(s);
  }
  
  // High-charge associations (reasoning patterns)
  const associations = allNodes.filter(n => n.type === NodeType.ASSOCIATION);
  if (associations.length > 0) {
    let s = `**Reasoning Patterns:**\n`;
    for (const a of associations.slice(0, 3)) {
      const line = `- When encountering ${a.ref.replace('->', ' → consider ')} (${Math.round(a.charge * 100)}% strength)\n`;
      if (charCount + line.length > maxChars) break;
      s += line;
      charCount += line.length;
    }
    sections.push(s);
  }
  
  // Quality rules
  const rules = allNodes.filter(n => n.type === NodeType.QUALITY_RULE);
  if (rules.length > 0 && charCount < maxChars - 200) {
    let s = `**Quality Gates:**\n`;
    for (const r of rules.slice(0, 3)) {
      const line = `- ${r.ref} (${Math.round(r.charge * 100)}% charge)\n`;
      if (charCount + line.length > maxChars) break;
      s += line;
      charCount += line.length;
    }
    sections.push(s);
  }
  
  return sections.join('\n');
}

// =====================================================================
// CACHE MANAGEMENT
// =====================================================================

/**
 * Invalidate the graph cache (called after events that change the graph).
 */
export function invalidateGraphCache(userId, firmId) {
  graphCache.delete(`${userId}:${firmId}`);
}

/**
 * Get graph stats for the attorney identity API endpoint.
 */
export async function getGraphStats(userId, firmId) {
  const graph = await loadResonanceGraph(userId, firmId);
  return graph.getSummary();
}

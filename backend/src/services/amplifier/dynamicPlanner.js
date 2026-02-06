/**
 * Dynamic Planner for Amplifier - "Cursor for Lawyers" Planning Layer
 * 
 * This module creates optimal execution plans based on task analysis:
 * 1. Breaks tasks into optimal 30-minute chunks
 * 2. Creates dependency graphs between chunks
 * 3. Defines checkpoints and quality gates
 * 4. Prepares fallback strategies
 * 
 * This transforms static modules into dynamic, adaptive task trees
 */

/**
 * Task Chunk Definition
 */
export class TaskChunk {
  constructor({
    id,
    chunkNumber,
    totalChunks,
    subGoal,
    estimatedMinutes = 30,
    priority = 'medium',
    dependencies = [],
    requiredTools = [],
    qualityGates = [],
    checkpointData = {},
    fallbackStrategy = null
  }) {
    this.id = id || `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.chunkNumber = chunkNumber;
    this.totalChunks = totalChunks;
    this.subGoal = subGoal;
    this.estimatedMinutes = estimatedMinutes;
    this.priority = priority;
    this.dependencies = dependencies;
    this.requiredTools = requiredTools;
    this.qualityGates = qualityGates;
    this.checkpointData = checkpointData;
    this.fallbackStrategy = fallbackStrategy;
    
    // Runtime state
    this.status = 'pending';
    this.startedAt = null;
    this.completedAt = null;
    this.actualMinutes = null;
    this.results = null;
    this.errors = [];
  }

  getProgress() {
    return {
      chunkNumber: this.chunkNumber,
      totalChunks: this.totalChunks,
      subGoal: this.subGoal,
      status: this.status,
      estimatedMinutes: this.estimatedMinutes,
      actualMinutes: this.actualMinutes,
      progress: this.calculateProgress()
    };
  }

  calculateProgress() {
    if (this.status === 'completed') return 100;
    if (this.status === 'failed') return 0;
    if (this.status === 'running' && this.startedAt) {
      const elapsedMs = Date.now() - this.startedAt;
      const estimatedMs = this.estimatedMinutes * 60 * 1000;
      return Math.min(95, Math.round((elapsedMs / estimatedMs) * 100));
    }
    return 0;
  }
}

/**
 * Dynamic Task Plan
 */
export class TaskPlan {
  constructor(goal, analysis) {
    this.goal = goal;
    this.analysis = analysis;
    this.chunks = [];
    this.dependencyGraph = new Map();
    this.checkpoints = [];
    this.fallbackStrategies = new Map();
    this.qualityGates = [];
  }

  /**
   * Create optimal chunks based on analysis
   */
  createChunks() {
    const { recommendations } = this.analysis;
    
    if (!recommendations.shouldChunk) {
      // Single chunk for simple tasks
      this.chunks = [
        new TaskChunk({
          chunkNumber: 1,
          totalChunks: 1,
          subGoal: this.goal,
          estimatedMinutes: recommendations.estimatedTime || 30,
          priority: this.determinePriority(1, 1)
        })
      ];
      return this.chunks;
    }

    const chunkCount = recommendations.chunkCount;
    const chunkSize = recommendations.optimalChunkSize;
    const approach = recommendations.executionApproach;

    // Generate chunks based on approach
    switch (approach) {
      case 'risk-first':
        this.chunks = this.createRiskFirstChunks(chunkCount, chunkSize);
        break;
      case 'breadth-then-depth':
        this.chunks = this.createBreadthDepthChunks(chunkCount, chunkSize);
        break;
      case 'framework-first':
        this.chunks = this.createFrameworkFirstChunks(chunkCount, chunkSize);
        break;
      case 'deadline-driven':
        this.chunks = this.createDeadlineDrivenChunks(chunkCount, chunkSize);
        break;
      default:
        this.chunks = this.createSequentialChunks(chunkCount, chunkSize);
    }

    // Build dependency graph
    this.buildDependencyGraph();
    
    // Add checkpoints
    this.addCheckpoints();
    
    // Prepare fallback strategies
    this.prepareFallbackStrategies();

    return this.chunks;
  }

  /**
   * Create sequential chunks (simple linear decomposition)
   */
  createSequentialChunks(chunkCount, chunkSize) {
    const chunks = [];
    
    for (let i = 0; i < chunkCount; i++) {
      const chunkNumber = i + 1;
      const subGoal = this.generateSubGoal(chunkNumber, chunkCount, 'sequential');
      
      chunks.push(new TaskChunk({
        chunkNumber,
        totalChunks: chunkCount,
        subGoal,
        estimatedMinutes: chunkSize,
        priority: this.determinePriority(chunkNumber, chunkCount),
        dependencies: i > 0 ? [`chunk-${i}`] : []
      }));
    }
    
    return chunks;
  }

  /**
   * Create risk-first chunks (highest risk items first)
   */
  createRiskFirstChunks(chunkCount, chunkSize) {
    const { context } = this.analysis;
    const chunks = [];
    
    // Chunk 1: High-risk items (privilege review, critical deadlines)
    chunks.push(new TaskChunk({
      chunkNumber: 1,
      totalChunks: chunkCount,
      subGoal: 'Review high-risk items (privileged documents, critical deadlines)',
      estimatedMinutes: chunkSize,
      priority: 'critical',
      requiredTools: ['analyze_document', 'check_deadlines']
    }));
    
    // Chunk 2: Medium-risk items
    chunks.push(new TaskChunk({
      chunkNumber: 2,
      totalChunks: chunkCount,
      subGoal: 'Analyze medium-risk items (key evidence, important correspondence)',
      estimatedMinutes: chunkSize,
      priority: 'high',
      dependencies: ['chunk-1'],
      requiredTools: ['analyze_document', 'extract_key_points']
    }));
    
    // Remaining chunks: Lower-risk items
    for (let i = 2; i < chunkCount; i++) {
      const chunkNumber = i + 1;
      chunks.push(new TaskChunk({
        chunkNumber,
        totalChunks: chunkCount,
        subGoal: `Process remaining items (batch ${chunkNumber - 2} of ${chunkCount - 2})`,
        estimatedMinutes: chunkSize,
        priority: 'medium',
        dependencies: [`chunk-${chunkNumber - 1}`],
        requiredTools: ['analyze_document', 'summarize_content']
      }));
    }
    
    return chunks;
  }

  /**
   * Create breadth-then-depth chunks (quick scan then deep dive)
   */
  createBreadthDepthChunks(chunkCount, chunkSize) {
    const breadthChunks = Math.max(1, Math.floor(chunkCount * 0.3)); // 30% for breadth
    const depthChunks = chunkCount - breadthChunks;
    
    const chunks = [];
    
    // Breadth phase: Quick scan of everything
    for (let i = 0; i < breadthChunks; i++) {
      chunks.push(new TaskChunk({
        chunkNumber: i + 1,
        totalChunks: chunkCount,
        subGoal: `Quick scan phase ${i + 1}/${breadthChunks} (identify areas for deep dive)`,
        estimatedMinutes: chunkSize,
        priority: 'high',
        dependencies: i > 0 ? [`chunk-${i}`] : [],
        requiredTools: ['scan_documents', 'identify_patterns']
      }));
    }
    
    // Depth phase: Deep dive into identified areas
    for (let i = 0; i < depthChunks; i++) {
      const chunkNumber = breadthChunks + i + 1;
      chunks.push(new TaskChunk({
        chunkNumber,
        totalChunks: chunkCount,
        subGoal: `Deep dive analysis ${i + 1}/${depthChunks} (detailed examination)`,
        estimatedMinutes: chunkSize,
        priority: 'medium',
        dependencies: [`chunk-${breadthChunks}`], // Depends on last breadth chunk
        requiredTools: ['analyze_document', 'extract_key_points', 'assess_risks']
      }));
    }
    
    return chunks;
  }

  /**
   * Generate sub-goal for a chunk
   */
  generateSubGoal(chunkNumber, totalChunks, approach) {
    const taskType = this.analysis.understanding?.taskType || 'general';
    
    const templates = {
      'document': {
        'sequential': [
          'Organize and categorize documents',
          'Review key documents for critical information',
          'Analyze supporting documents and evidence',
          'Extract key facts and admissions',
          'Identify privilege and confidentiality issues',
          'Summarize findings and prepare report'
        ],
        'risk-first': [
          'Review privileged and confidential documents',
          'Analyze high-risk documents and evidence',
          'Examine key correspondence and communications',
          'Review supporting documentation',
          'Prepare comprehensive analysis summary'
        ]
      },
      'research': {
        'sequential': [
          'Define research scope and key questions',
          'Gather primary sources and statutes',
          'Research case law and precedents',
          'Analyze legal arguments and authorities',
          'Synthesize findings and prepare memorandum'
        ]
      },
      'analysis': {
        'sequential': [
          'Establish analysis framework and criteria',
          'Gather and organize relevant data',
          'Apply analytical models and methodologies',
          'Interpret results and identify patterns',
          'Prepare recommendations and action plan'
        ]
      }
    };

    const taskTemplates = templates[taskType]?.[approach] || templates['document']?.['sequential'];
    
    if (taskTemplates && chunkNumber <= taskTemplates.length) {
      return taskTemplates[chunkNumber - 1];
    }
    
    // Fallback template
    const phaseNames = ['Initial', 'Primary', 'Secondary', 'Tertiary', 'Final'];
    const phase = phaseNames[Math.min(chunkNumber - 1, phaseNames.length - 1)] || `Phase ${chunkNumber}`;
    
    return `${phase} analysis and review (${chunkNumber}/${totalChunks})`;
  }

  /**
   * Determine chunk priority
   */
  determinePriority(chunkNumber, totalChunks) {
    // First chunk often highest priority (sets up everything)
    if (chunkNumber === 1) return 'high';
    
    // Last chunk often high priority (delivers final results)
    if (chunkNumber === totalChunks) return 'high';
    
    // Middle chunks typically medium priority
    return 'medium';
  }

  /**
   * Build dependency graph between chunks
   */
  buildDependencyGraph() {
    this.dependencyGraph.clear();
    
    for (const chunk of this.chunks) {
      this.dependencyGraph.set(chunk.id, {
        chunk,
        dependencies: chunk.dependencies,
        dependents: []
      });
    }
    
    // Build reverse dependencies
    for (const [chunkId, node] of this.dependencyGraph.entries()) {
      for (const depId of node.dependencies) {
        const depNode = this.dependencyGraph.get(depId);
        if (depNode) {
          depNode.dependents.push(chunkId);
        }
      }
    }
  }

  /**
   * Check if a chunk can start (all dependencies satisfied)
   */
  canStartChunk(chunkId) {
    const node = this.dependencyGraph.get(chunkId);
    if (!node) return false;
    
    for (const depId of node.dependencies) {
      const depNode = this.dependencyGraph.get(depId);
      if (!depNode || depNode.chunk.status !== 'completed') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get next chunk that can be executed
   */
  getNextChunk() {
    for (const chunk of this.chunks) {
      if (chunk.status === 'pending' && this.canStartChunk(chunk.id)) {
        return chunk;
      }
    }
    return null;
  }

  /**
   * Add checkpoints at strategic points
   */
  addCheckpoints() {
    // Checkpoint after each high-priority chunk
    for (const chunk of this.chunks) {
      if (chunk.priority === 'critical' || chunk.priority === 'high') {
        this.checkpoints.push({
          chunkId: chunk.id,
          chunkNumber: chunk.chunkNumber,
          type: 'strategic',
          description: `Checkpoint after ${chunk.subGoal}`
        });
      }
    }
    
    // Checkpoint at 25%, 50%, 75% completion
    const quarterPoints = [
      Math.floor(this.chunks.length * 0.25),
      Math.floor(this.chunks.length * 0.5),
      Math.floor(this.chunks.length * 0.75)
    ];
    
    for (const point of quarterPoints) {
      if (point > 0 && point < this.chunks.length) {
        const chunk = this.chunks[point];
        this.checkpoints.push({
          chunkId: chunk.id,
          chunkNumber: chunk.chunkNumber,
          type: 'progress',
          description: `Quarter-point checkpoint (${Math.round((point / this.chunks.length) * 100)}% complete)`
        });
      }
    }
  }

  /**
   * Prepare fallback strategies for each chunk
   */
  prepareFallbackStrategies() {
    for (const chunk of this.chunks) {
      const strategies = [];
      
      // Tool failure fallback
      if (chunk.requiredTools.length > 0) {
        strategies.push({
          type: 'tool_failure',
          condition: 'Primary tool fails or times out',
          action: 'Switch to alternative tool or manual process',
          priority: 'high'
        });
      }
      
      // Time overrun fallback
      strategies.push({
        type: 'time_overrun',
        condition: `Chunk exceeds ${chunk.estimatedMinutes * 1.5} minutes`,
        action: 'Skip to next chunk or reduce scope',
        priority: 'medium'
      });
      
      // Quality failure fallback
      if (chunk.qualityGates.length > 0) {
        strategies.push({
          type: 'quality_failure',
          condition: 'Fails to meet quality gates',
          action: 'Retry with different approach or escalate for human review',
          priority: 'high'
        });
      }
      
      this.fallbackStrategies.set(chunk.id, strategies);
    }
  }

  /**
   * Get overall plan progress
   */
  getProgress() {
    const completed = this.chunks.filter(c => c.status === 'completed').length;
    const running = this.chunks.filter(c => c.status === 'running').length;
    const failed = this.chunks.filter(c => c.status === 'failed').length;
    const total = this.chunks.length;
    
    const totalEstimated = this.chunks.reduce((sum, c) => sum + c.estimatedMinutes, 0);
    const totalActual = this.chunks
      .filter(c => c.actualMinutes)
      .reduce((sum, c) => sum + c.actualMinutes, 0);
    
    return {
      completed,
      running,
      failed,
      total,
      percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
      estimatedMinutesTotal: totalEstimated,
      actualMinutesTotal: totalActual,
      timeRemaining: totalEstimated - totalActual,
      nextChunk: this.getNextChunk()?.chunkNumber || null
    };
  }

  /**
   * Get plan summary for reporting
   */
  getSummary() {
    const progress = this.getProgress();
    
    return {
      goal: this.goal,
      chunkCount: this.chunks.length,
      executionApproach: this.analysis.recommendations?.executionApproach || 'sequential',
      progress,
      chunks: this.chunks.map(c => ({
        chunkNumber: c.chunkNumber,
        subGoal: c.subGoal,
        status: c.status,
        estimatedMinutes: c.estimatedMinutes,
        actualMinutes: c.actualMinutes,
        priority: c.priority
      })),
      checkpoints: this.checkpoints,
      risks: this.analysis.understanding?.risks || []
    };
  }
}

/**
 * Create a dynamic task plan
 */
export function createTaskPlan(goal, analysis) {
  return new TaskPlan(goal, analysis);
}

/**
 * Generate chunks for a task
 */
export function generateChunks(goal, analysis) {
  const plan = createTaskPlan(goal, analysis);
  return plan.createChunks();
}
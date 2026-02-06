/**
 * Knowledge Manager - Unified Interface for All Legal Knowledge Resources
 * 
 * Provides a single interface to access:
 * 1. Document templates and forms
 * 2. Legal checklists and workflows
 * 3. Statutes and court rules database
 * 4. Best practices and heuristics
 * 5. Integration with decision reinforcement system
 */

import { generateDocument, getTemplate, listTemplates, getChecklist as getDocChecklist, validateDocument } from './documentTemplates.js';
import { getChecklist, listChecklists, generateChecklist, validateAgainstChecklist, recommendChecklist } from './legalChecklists.js';
import { searchStatutes, getStatute, getDeadlines, getRelatedStatutes, validateCitation, suggestStatute } from './statutesDatabase.js';
import { DecisionReinforcer, integrateWithOrchestrator } from '../decisionReinforcer.js';

export class KnowledgeManager {
  constructor() {
    // Initialize knowledge bases
    this.templates = { generateDocument, getTemplate, listTemplates, getDocChecklist, validateDocument };
    this.checklists = { getChecklist, listChecklists, generateChecklist, validateAgainstChecklist, recommendChecklist };
    this.statutes = { searchStatutes, getStatute, getDeadlines, getRelatedStatutes, validateCitation, suggestStatute };
    
    // Initialize decision reinforcer
    this.reinforcer = new DecisionReinforcer();
    
    // Knowledge usage tracking
    this.usageStats = {
      templates: new Map(),
      checklists: new Map(),
      statutes: new Map(),
      decisions: new Map()
    };
    
    // Best practices cache
    this.bestPractices = this.loadBestPractices();
  }
  
  /**
   * Load best practices from database or file
   */
  loadBestPractices() {
    return {
      documentReview: [
        'Start with privilege review to avoid waiver issues',
        'Use risk-first approach for complex document sets',
        'Maintain consistent coding and tagging',
        'Document assumptions and limitations',
        'Include quality checkpoints every 100 documents'
      ],
      legalResearch: [
        'Start with statutes before case law',
        'Check for recent amendments and updates',
        'Verify jurisdiction applicability',
        'Cite primary sources before secondary',
        'Note split authority and distinguish cases'
      ],
      motionPractice: [
        'Check local rules for formatting requirements',
        'Include table of authorities for lengthy briefs',
        'Prepare separate statement of facts for summary judgment',
        'Meet and confer before filing discovery motions',
        'Calendar all deadlines and hearing dates'
      ],
      clientCommunication: [
        'Confirm scope and expectations in writing',
        'Provide regular status updates',
        'Explain legal concepts in plain language',
        'Include cost estimates when possible',
        'Document all advice and instructions'
      ]
    };
  }
  
  /**
   * Unified search across all knowledge bases
   */
  searchAllKnowledge(query, options = {}) {
    const results = {
      statutes: [],
      templates: [],
      checklists: [],
      bestPractices: [],
      decisions: []
    };
    
    // Search statutes
    if (!options.excludeStatutes) {
      results.statutes = this.statutes.searchStatutes(query);
    }
    
    // Search templates
    if (!options.excludeTemplates) {
      const allTemplates = this.templates.listTemplates();
      results.templates = allTemplates.filter(template => 
        template.displayName.toLowerCase().includes(query.toLowerCase()) ||
        template.description.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    // Search checklists
    if (!options.excludeChecklists) {
      const allChecklists = this.checklists.listChecklists();
      results.checklists = allChecklists.filter(checklist => 
        checklist.displayName.toLowerCase().includes(query.toLowerCase()) ||
        checklist.description.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    // Search best practices
    if (!options.excludeBestPractices) {
      for (const [category, practices] of Object.entries(this.bestPractices)) {
        const matching = practices.filter(practice => 
          practice.toLowerCase().includes(query.toLowerCase())
        );
        if (matching.length > 0) {
          results.bestPractices.push({
            category,
            practices: matching
          });
        }
      }
    }
    
    // Search decision rules (from reinforcer)
    if (!options.excludeDecisions && this.reinforcer.decisionRules.size > 0) {
      for (const [ruleId, rule] of this.reinforcer.decisionRules.entries()) {
        const contextStr = JSON.stringify(rule.context).toLowerCase();
        if (contextStr.includes(query.toLowerCase())) {
          results.decisions.push({
            ruleId,
            context: rule.context,
            decision: rule.decision,
            effectiveness: rule.effectiveness,
            attempts: rule.attempts
          });
        }
      }
    }
    
    // Track usage
    this.trackUsage('search', { query, resultCount: Object.values(results).flat().length });
    
    return results;
  }
  
  /**
   * Get comprehensive guidance for a task
   */
  getTaskGuidance(taskType, context = {}) {
    const guidance = {
      taskType,
      recommendedChecklists: this.checklists.recommendChecklist(taskType),
      relevantStatutes: this.statutes.suggestStatute(taskType),
      bestPractices: this.bestPractices[taskType] || [],
      templateSuggestions: this.suggestTemplatesForTask(taskType),
      strategyAdvice: this.getStrategyAdvice(taskType, context),
      qualityCheckpoints: this.getQualityCheckpoints(taskType)
    };
    
    // Get decision metrics for this task type
    const decisionMetrics = this.reinforcer.getDecisionMetrics(taskType);
    guidance.decisionMetrics = decisionMetrics;
    
    // Get best strategy based on learned weights
    if (decisionMetrics.strategies.length > 0) {
      guidance.recommendedStrategy = decisionMetrics.strategies[0];
    }
    
    // Track usage
    this.trackUsage('taskGuidance', { taskType });
    
    return guidance;
  }
  
  /**
   * Suggest templates for a task type
   */
  suggestTemplatesForTask(taskType) {
    const suggestions = {
      'document_review': ['contractReview', 'employmentAgreement'],
      'legal_research': ['caseStrategyMemo', 'opinionLetter'],
      'motion_practice': ['complaint', 'answer'],
      'client_intake': ['engagementLetter'],
      'due_diligence': ['contractReview', 'closingChecklist'],
      'contract_drafting': ['nda', 'consultingAgreement', 'employmentAgreement'],
      'correspondence': ['demandLetter', 'opinionLetter']
    };
    
    const templateNames = suggestions[taskType] || [];
    return templateNames.map(name => this.templates.getTemplate(name))
      .filter(template => template !== null);
  }
  
  /**
   * Get strategy advice based on task type and context
   */
  getStrategyAdvice(taskType, context) {
    const advice = [];
    
    // General advice based on task type
    switch (taskType) {
      case 'document_review':
        advice.push('Use risk-first approach for privilege review');
        advice.push('Consider document count and complexity when estimating time');
        advice.push('Batch similar documents for efficiency');
        break;
      case 'legal_research':
        advice.push('Start with statutory research before case law');
        advice.push('Check for recent appellate decisions');
        advice.push('Verify jurisdictional applicability');
        break;
      case 'motion_practice':
        advice.push('Check local rules for formatting requirements');
        advice.push('Calendar all deadlines carefully');
        advice.push('Prepare table of authorities for complex motions');
        break;
    }
    
    // Context-specific advice
    if (context.complexity === 'high') {
      advice.push('Consider breaking into smaller chunks');
      advice.push('Schedule regular checkpoints');
      advice.push('Document assumptions and decision points');
    }
    
    if (context.deadlineNear) {
      advice.push('Prioritize critical path items');
      advice.push('Consider scope adjustment if needed');
      advice.push('Communicate timeline constraints clearly');
    }
    
    return advice;
  }
  
  /**
   * Get quality checkpoints for a task type
   */
  getQualityCheckpoints(taskType) {
    const checkpoints = {
      'document_review': [
        'Privilege review completed',
        'Key documents identified and tagged',
        'Summary of findings prepared',
        'Quality control sample reviewed'
      ],
      'legal_research': [
        'Research question clearly defined',
        'Primary sources verified',
        'Conflicting authority noted',
        'Analysis supported by citations'
      ],
      'contract_drafting': [
        'All required sections included',
        'Definitions consistent throughout',
        'Risk allocation balanced',
        'Final review for clarity and consistency'
      ]
    };
    
    return checkpoints[taskType] || [
      'Task objectives met',
      'Quality standards satisfied',
      'Deliverable ready for review'
    ];
  }
  
  /**
   * Validate a task against knowledge bases
   */
  validateTask(task, taskOutput) {
    const validations = [];
    
    // Validate against recommended checklists
    const recommendedChecklists = this.checklists.recommendChecklist(task.type);
    for (const checklistName of recommendedChecklists) {
      const checklist = this.checklists.getChecklist(checklistName);
      if (checklist) {
        const validation = this.checklists.validateAgainstChecklist(
          checklistName,
          taskOutput,
          [] // Empty completed items for now
        );
        validations.push({
          checklist: checklistName,
          validation
        });
      }
    }
    
    // Validate legal citations if present
    const citationMatches = taskOutput.match(/CPLR\s+\d+|GBL\s+\d+|CRL\s+\d+|FRCP\s+\d+|\d+\s+NYCRR|Rule\s+\d+\.\d+/gi) || [];
    const citationValidations = citationMatches.map(citation => 
      this.statutes.validateCitation(citation)
    );
    
    // Check for best practices compliance
    const bestPracticeCompliance = [];
    if (this.bestPractices[task.type]) {
      for (const practice of this.bestPractices[task.type]) {
        const present = taskOutput.toLowerCase().includes(practice.toLowerCase().split(' ')[0]);
        bestPracticeCompliance.push({
          practice,
          present
        });
      }
    }
    
    return {
      validations,
      citationValidations,
      bestPracticeCompliance,
      overallScore: this.calculateValidationScore(validations, citationValidations, bestPracticeCompliance)
    };
  }
  
  /**
   * Calculate validation score
   */
  calculateValidationScore(validations, citationValidations, bestPracticeCompliance) {
    let score = 100;
    
    // Deduct for missing checklist items
    for (const validation of validations) {
      if (validation.validation.completionRate < 50) {
        score -= 10;
      } else if (validation.validation.completionRate < 75) {
        score -= 5;
      }
    }
    
    // Deduct for invalid citations
    const invalidCitations = citationValidations.filter(v => !v.valid).length;
    score -= invalidCitations * 5;
    
    // Deduct for missing best practices
    const missingPractices = bestPracticeCompliance.filter(p => !p.present).length;
    score -= missingPractices * 3;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  /**
   * Record knowledge usage for analytics
   */
  trackUsage(action, data) {
    const timestamp = new Date();
    
    switch (action) {
      case 'search':
        if (!this.usageStats.statutes.has(data.query)) {
          this.usageStats.statutes.set(data.query, { count: 0, firstUsed: timestamp });
        }
        const stat = this.usageStats.statutes.get(data.query);
        stat.count++;
        stat.lastUsed = timestamp;
        break;
        
      case 'taskGuidance':
        if (!this.usageStats.decisions.has(data.taskType)) {
          this.usageStats.decisions.set(data.taskType, { count: 0, firstUsed: timestamp });
        }
        const decisionStat = this.usageStats.decisions.get(data.taskType);
        decisionStat.count++;
        decisionStat.lastUsed = timestamp;
        break;
    }
  }
  
  /**
   * Get usage analytics
   */
  getUsageAnalytics() {
    return {
      templates: Array.from(this.usageStats.templates.entries()).map(([name, stats]) => ({
        name,
        ...stats
      })),
      checklists: Array.from(this.usageStats.checklists.entries()).map(([name, stats]) => ({
        name,
        ...stats
      })),
      statutes: Array.from(this.usageStats.statutes.entries()).map(([query, stats]) => ({
        query,
        ...stats
      })),
      decisions: Array.from(this.usageStats.decisions.entries()).map(([taskType, stats]) => ({
        taskType,
        ...stats
      })),
      totalSearches: Array.from(this.usageStats.statutes.values()).reduce((sum, stats) => sum + stats.count, 0),
      totalGuidanceRequests: Array.from(this.usageStats.decisions.values()).reduce((sum, stats) => sum + stats.count, 0)
    };
  }
  
  /**
   * Integrate with orchestrator for decision reinforcement
   */
  integrateWithOrchestrator(orchestrator) {
    return integrateWithOrchestrator(orchestrator, this.reinforcer);
  }
  
  /**
   * Get decision reinforcer for direct access
   */
  getDecisionReinforcer() {
    return this.reinforcer;
  }
  
  /**
   * Export knowledge for backup or sharing
   */
  exportKnowledge() {
    return {
      templates: this.templates.listTemplates(),
      checklists: this.checklists.listChecklists(),
      decisionRules: Array.from(this.reinforcer.decisionRules.entries()),
      strategyWeights: Array.from(this.reinforcer.strategyWeights.entries()),
      usageStats: this.getUsageAnalytics(),
      bestPractices: this.bestPractices,
      exportDate: new Date().toISOString()
    };
  }
  
  /**
   * Import knowledge from backup
   */
  importKnowledge(data) {
    if (data.decisionRules) {
      data.decisionRules.forEach(([ruleId, rule]) => {
        this.reinforcer.decisionRules.set(ruleId, rule);
      });
    }
    
    if (data.strategyWeights) {
      data.strategyWeights.forEach(([key, weight]) => {
        this.reinforcer.strategyWeights.set(key, weight);
      });
    }
    
    if (data.bestPractices) {
      this.bestPractices = data.bestPractices;
    }
    
    return { imported: true, itemCount: data.decisionRules?.length || 0 };
  }
  
  /**
   * Reset learning (for testing or major changes)
   */
  resetLearning() {
    this.reinforcer.reset();
    this.usageStats = {
      templates: new Map(),
      checklists: new Map(),
      statutes: new Map(),
      decisions: new Map()
    };
    
    return { reset: true };
  }
}

// Singleton instance for easy access
let knowledgeManagerInstance = null;

/**
 * Get or create the global knowledge manager
 */
export function getKnowledgeManager() {
  if (!knowledgeManagerInstance) {
    knowledgeManagerInstance = new KnowledgeManager();
  }
  return knowledgeManagerInstance;
}

/**
 * Quick access functions for common operations
 */
export const searchKnowledge = (query, options) => 
  getKnowledgeManager().searchAllKnowledge(query, options);

export const getTaskGuidance = (taskType, context) => 
  getKnowledgeManager().getTaskGuidance(taskType, context);

export const validateTaskOutput = (task, output) => 
  getKnowledgeManager().validateTask(task, output);

export const getUsageStats = () => 
  getKnowledgeManager().getUsageAnalytics();

export const integrateKnowledgeWithOrchestrator = (orchestrator) => 
  getKnowledgeManager().integrateWithOrchestrator(orchestrator);

/**
 * Demonstration function
 */
export function demonstrateKnowledgeManager() {
  const km = getKnowledgeManager();
  
  console.log('🧠 KNOWLEDGE MANAGER DEMONSTRATION');
  console.log('='.repeat(60));
  
  console.log('\n📚 Available Knowledge Resources:');
  
  const templates = km.templates.listTemplates();
  console.log(`   Document Templates: ${templates.length} templates`);
  
  const checklists = km.checklists.listChecklists();
  console.log(`   Legal Checklists: ${checklists.length} checklists`);
  
  console.log('\n🔍 Unified Search Example:');
  const searchResults = km.searchAllKnowledge('contract');
  console.log(`   Statutes found: ${searchResults.statutes.length}`);
  console.log(`   Templates found: ${searchResults.templates.length}`);
  console.log(`   Checklists found: ${searchResults.checklists.length}`);
  
  console.log('\n🎯 Task Guidance Example (document_review):');
  const guidance = km.getTaskGuidance('document_review', { complexity: 'high' });
  console.log(`   Recommended checklists: ${guidance.recommendedChecklists.length}`);
  console.log(`   Best practices: ${guidance.bestPractices.length}`);
  console.log(`   Strategy advice: ${guidance.strategyAdvice.length} items`);
  
  console.log('\n📊 Decision Reinforcement Integration:');
  const reinforcer = km.getDecisionReinforcer();
  console.log(`   Strategy weights tracked: ${reinforcer.getStats().strategyWeights}`);
  console.log(`   Decision rules learned: ${reinforcer.getStats().decisionRules}`);
  console.log(`   Exploration rate: ${reinforcer.explorationRate.toFixed(2)}`);
  
  console.log('\n✅ Knowledge Manager ready');
  console.log('✅ Unified access to all legal knowledge');
  console.log('✅ Integrated with decision reinforcement');
  console.log('✅ Usage tracking and analytics');
  
  return {
    templates: templates.length,
    checklists: checklists.length,
    searchResults: searchResults,
    guidance: guidance
  };
}
/**
 * Knowledge Module Index
 * 
 * Exports all knowledge resources and utilities for the Amplifier system.
 */

// Document Templates
export * from './documentTemplates.js';

// Legal Checklists
export * from './legalChecklists.js';

// Statutes Database
export * from './statutesDatabase.js';

// Knowledge Manager (Main Interface)
export * from './knowledgeManager.js';

// Decision Reinforcer
export * from '../decisionReinforcer.js';

/**
 * Quick Import Helper
 */
export function createKnowledgeSystem() {
  const knowledgeManager = require('./knowledgeManager.js').getKnowledgeManager();
  return {
    manager: knowledgeManager,
    templates: require('./documentTemplates.js'),
    checklists: require('./legalChecklists.js'),
    statutes: require('./statutesDatabase.js'),
    reinforcer: require('../decisionReinforcer.js')
  };
}

/**
 * Initialize all knowledge systems
 */
export function initializeKnowledgeSystems() {
  console.log('🧠 Initializing Knowledge Systems...');
  
  const km = require('./knowledgeManager.js').getKnowledgeManager();
  
  // Demonstrate capabilities
  console.log('📚 Available Resources:');
  console.log(`   Templates: ${km.templates.listTemplates().length}`);
  console.log(`   Checklists: ${km.checklists.listChecklists().length}`);
  console.log(`   Statutes: ${km.statutes.searchStatutes('CPLR').length} CPLR sections`);
  
  // Test search
  const testSearch = km.searchAllKnowledge('contract');
  console.log(`   Unified search test: ${testSearch.statutes.length + testSearch.templates.length + testSearch.checklists.length} results`);
  
  console.log('✅ Knowledge systems initialized');
  return km;
}

/**
 * Get task-specific knowledge bundle
 */
export function getKnowledgeBundle(taskType, context = {}) {
  const km = require('./knowledgeManager.js').getKnowledgeManager();
  
  return {
    guidance: km.getTaskGuidance(taskType, context),
    templates: km.suggestTemplatesForTask(taskType),
    checklists: km.checklists.recommendChecklist(taskType).map(name => 
      km.checklists.getChecklist(name)
    ).filter(c => c !== null),
    statutes: km.statutes.suggestStatute(taskType),
    bestPractices: km.bestPractices[taskType] || [],
    decisionMetrics: km.reinforcer.getDecisionMetrics(taskType)
  };
}

/**
 * Export everything for easy imports
 */
export default {
  // Core systems
  getKnowledgeManager: () => require('./knowledgeManager.js').getKnowledgeManager(),
  createKnowledgeSystem,
  initializeKnowledgeSystems,
  getKnowledgeBundle,
  
  // Individual components
  documentTemplates: require('./documentTemplates.js'),
  legalChecklists: require('./legalChecklists.js'),
  statutesDatabase: require('./statutesDatabase.js'),
  decisionReinforcer: require('../decisionReinforcer.js'),
  
  // Utilities
  searchKnowledge: (query, options) => 
    require('./knowledgeManager.js').searchAllKnowledge(query, options),
  validateTask: (task, output) => 
    require('./knowledgeManager.js').validateTask(task, output),
  getUsageStats: () => 
    require('./knowledgeManager.js').getUsageAnalytics()
};
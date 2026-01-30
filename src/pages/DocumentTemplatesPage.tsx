import { useState, useEffect } from 'react'
import { 
  FileText, Search, Plus, Edit, Trash2, Copy, Download,
  FolderOpen, Sparkles, Tag, Clock, Users, Loader2, X,
  ChevronDown, Check, Eye, Wand2, Settings
} from 'lucide-react'
import { documentTemplatesApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { format, parseISO } from 'date-fns'
import styles from './DocumentTemplatesPage.module.css'
import { useToast } from '../components/Toast'

interface Template {
  id: string
  name: string
  description: string
  category: string
  practiceArea: string
  content: string
  variables: string[]
  aiEnabled: boolean
  aiPrompts: any
  isActive: boolean
  usageCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'pleadings', label: 'Pleadings' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'letters', label: 'Letters' },
  { value: 'motions', label: 'Motions' },
  { value: 'agreements', label: 'Agreements' },
  { value: 'forms', label: 'Forms' },
  { value: 'other', label: 'Other' }
]

const PRACTICE_AREAS = [
  { value: 'all', label: 'All Practice Areas' },
  { value: 'litigation', label: 'Litigation' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'real-estate', label: 'Real Estate' },
  { value: 'family', label: 'Family Law' },
  { value: 'criminal', label: 'Criminal' },
  { value: 'estate', label: 'Estate Planning' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'ip', label: 'Intellectual Property' },
  { value: 'employment', label: 'Employment' },
  { value: 'general', label: 'General Practice' }
]

export function DocumentTemplatesPage() {
  const { user } = useAuthStore()
  const toast = useToast()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedPracticeArea, setSelectedPracticeArea] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  
  // Load templates
  useEffect(() => {
    loadTemplates()
  }, [])
  
  const loadTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await documentTemplatesApi.getTemplates()
      setTemplates(result.templates || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }
  
  // Filter templates
  const filteredTemplates = templates.filter(t => {
    const matchesSearch = !searchQuery || 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory
    const matchesPracticeArea = selectedPracticeArea === 'all' || t.practiceArea === selectedPracticeArea
    
    return matchesSearch && matchesCategory && matchesPracticeArea
  })
  
  // Handle template actions
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return
    
    try {
      await documentTemplatesApi.deleteTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (err: any) {
      alert('Failed to delete template: ' + err.message)
    }
  }
  
  const handleDuplicateTemplate = async (template: Template) => {
    try {
      const newTemplate = await documentTemplatesApi.createTemplate({
        name: `${template.name} (Copy)`,
        description: template.description,
        category: template.category,
        practiceArea: template.practiceArea,
        content: template.content,
        variables: template.variables,
        aiEnabled: template.aiEnabled,
        aiPrompts: template.aiPrompts,
        isActive: template.isActive
      })
      setTemplates(prev => [newTemplate, ...prev])
    } catch (err: any) {
      alert('Failed to duplicate template: ' + err.message)
    }
  }
  
  const handleCreateFromTemplate = (template: Template) => {
    // Navigate to document creation with template pre-filled
    // For now, just show an alert
    alert(`Create document from: ${template.name}\n\nThis feature will open a document editor with the template content pre-filled.`)
  }
  
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Loading templates...</p>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadTemplates}>Try Again</button>
        </div>
      </div>
    )
  }
  
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <FolderOpen size={28} className={styles.headerIcon} />
          <div>
            <h1>Document Templates</h1>
            <p>Create documents from reusable templates</p>
          </div>
        </div>
        {isAdmin && (
          <button className={styles.createBtn} onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            Create Template
          </button>
        )}
      </div>
      
      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={styles.filterSelect}
        >
          {CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
        
        <select
          value={selectedPracticeArea}
          onChange={(e) => setSelectedPracticeArea(e.target.value)}
          className={styles.filterSelect}
        >
          {PRACTICE_AREAS.map(area => (
            <option key={area.value} value={area.value}>{area.label}</option>
          ))}
        </select>
        
        <span className={styles.resultCount}>
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className={styles.emptyState}>
          <FileText size={48} />
          <h3>No templates found</h3>
          <p>
            {templates.length === 0 
              ? 'Get started by creating your first document template.'
              : 'Try adjusting your search or filters.'}
          </p>
          {isAdmin && templates.length === 0 && (
            <button className={styles.emptyCreateBtn} onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              Create Template
            </button>
          )}
        </div>
      ) : (
        <div className={styles.templatesGrid}>
          {filteredTemplates.map(template => (
            <div key={template.id} className={styles.templateCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <FileText size={24} />
                </div>
                <div className={styles.cardBadges}>
                  {template.aiEnabled && (
                    <span className={styles.aiBadge}>
                      <Sparkles size={12} />
                      AI
                    </span>
                  )}
                  <span className={styles.categoryBadge}>{template.category}</span>
                </div>
              </div>
              
              <h3 className={styles.cardTitle}>{template.name}</h3>
              
              {template.description && (
                <p className={styles.cardDescription}>{template.description}</p>
              )}
              
              <div className={styles.cardMeta}>
                <span className={styles.metaItem}>
                  <Tag size={14} />
                  {template.practiceArea || 'General'}
                </span>
                <span className={styles.metaItem}>
                  <Users size={14} />
                  {template.usageCount} uses
                </span>
              </div>
              
              {template.variables && template.variables.length > 0 && (
                <div className={styles.variablesList}>
                  <span className={styles.variablesLabel}>Variables:</span>
                  {template.variables.slice(0, 3).map((v, i) => (
                    <span key={i} className={styles.variableTag}>{`{{${v}}}`}</span>
                  ))}
                  {template.variables.length > 3 && (
                    <span className={styles.moreVariables}>+{template.variables.length - 3}</span>
                  )}
                </div>
              )}
              
              <div className={styles.cardActions}>
                <button 
                  className={styles.useBtn}
                  onClick={() => handleCreateFromTemplate(template)}
                >
                  <Wand2 size={16} />
                  Use Template
                </button>
                
                <div className={styles.secondaryActions}>
                  <button 
                    className={styles.iconBtn}
                    onClick={() => setPreviewTemplate(template)}
                    title="Preview"
                  >
                    <Eye size={16} />
                  </button>
                  <button 
                    className={styles.iconBtn}
                    onClick={() => handleDuplicateTemplate(template)}
                    title="Duplicate"
                  >
                    <Copy size={16} />
                  </button>
                  {isAdmin && (
                    <>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => setEditingTemplate(template)}
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        className={`${styles.iconBtn} ${styles.deleteBtn}`}
                        onClick={() => handleDeleteTemplate(template.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Preview Modal */}
      {previewTemplate && (
        <div className={styles.modalOverlay} onClick={() => setPreviewTemplate(null)}>
          <div className={styles.previewModal} onClick={e => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <h3>{previewTemplate.name}</h3>
              <button className={styles.closeBtn} onClick={() => setPreviewTemplate(null)}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.previewBody}>
              <div className={styles.previewMeta}>
                <span><Tag size={14} /> {previewTemplate.category}</span>
                <span><Clock size={14} /> Updated {format(parseISO(previewTemplate.updatedAt), 'MMM d, yyyy')}</span>
              </div>
              {previewTemplate.description && (
                <p className={styles.previewDescription}>{previewTemplate.description}</p>
              )}
              <div className={styles.previewContent}>
                <pre>{previewTemplate.content}</pre>
              </div>
            </div>
            <div className={styles.previewFooter}>
              <button 
                className={styles.previewUseBtn}
                onClick={() => {
                  handleCreateFromTemplate(previewTemplate)
                  setPreviewTemplate(null)
                }}
              >
                <Wand2 size={16} />
                Use This Template
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Create/Edit Modal */}
      {(showCreateModal || editingTemplate) && (
        <TemplateEditor
          template={editingTemplate}
          onClose={() => {
            setShowCreateModal(false)
            setEditingTemplate(null)
          }}
          onSave={(saved) => {
            if (editingTemplate) {
              setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t))
            } else {
              setTemplates(prev => [saved, ...prev])
            }
            setShowCreateModal(false)
            setEditingTemplate(null)
          }}
        />
      )}
    </div>
  )
}

// Template Editor Component
function TemplateEditor({ 
  template, 
  onClose, 
  onSave 
}: { 
  template: Template | null
  onClose: () => void
  onSave: (template: Template) => void
}) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    category: template?.category || 'other',
    practiceArea: template?.practiceArea || 'general',
    content: template?.content || '',
    variables: template?.variables?.join(', ') || '',
    aiEnabled: template?.aiEnabled || false,
    isActive: template?.isActive ?? true
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim() || !formData.content.trim()) {
      setError('Name and content are required')
      return
    }
    
    setSaving(true)
    setError(null)
    
    try {
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category,
        practiceArea: formData.practiceArea,
        content: formData.content,
        variables: formData.variables.split(',').map(v => v.trim()).filter(Boolean),
        aiEnabled: formData.aiEnabled,
        isActive: formData.isActive
      }
      
      let result
      if (template) {
        result = await documentTemplatesApi.updateTemplate(template.id, data)
      } else {
        result = await documentTemplatesApi.createTemplate(data)
      }
      
      onSave(result)
    } catch (err: any) {
      setError(err.message || 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }
  
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.editorModal} onClick={e => e.stopPropagation()}>
        <div className={styles.editorHeader}>
          <h3>{template ? 'Edit Template' : 'Create Template'}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.editorBody}>
            {error && (
              <div className={styles.formError}>{error}</div>
            )}
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Template Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Standard Retainer Agreement"
                  required
                />
              </div>
            </div>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of what this template is for..."
                  rows={2}
                />
              </div>
            </div>
            
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                >
                  {CATEGORIES.filter(c => c.value !== 'all').map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              
              <div className={styles.formGroup}>
                <label>Practice Area</label>
                <select
                  value={formData.practiceArea}
                  onChange={(e) => setFormData(prev => ({ ...prev, practiceArea: e.target.value }))}
                >
                  {PRACTICE_AREAS.filter(a => a.value !== 'all').map(area => (
                    <option key={area.value} value={area.value}>{area.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Template Content *</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter your template content here. Use {{variable_name}} for dynamic fields..."
                  rows={12}
                  className={styles.contentEditor}
                  required
                />
              </div>
            </div>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Variables (comma-separated)</label>
                <input
                  type="text"
                  value={formData.variables}
                  onChange={(e) => setFormData(prev => ({ ...prev, variables: e.target.value }))}
                  placeholder="e.g., client_name, matter_number, date"
                />
                <span className={styles.formHint}>
                  These will become fillable fields when using the template
                </span>
              </div>
            </div>
            
            <div className={styles.formCheckboxes}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.aiEnabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, aiEnabled: e.target.checked }))}
                />
                <Sparkles size={14} />
                Enable AI assistance for this template
              </label>
              
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                />
                <Check size={14} />
                Template is active and visible to users
              </label>
            </div>
          </div>
          
          <div className={styles.editorFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={16} className={styles.spinner} />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={16} />
                  {template ? 'Update Template' : 'Create Template'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default DocumentTemplatesPage

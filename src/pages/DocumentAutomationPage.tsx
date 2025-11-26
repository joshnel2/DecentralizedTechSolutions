import { useState } from 'react'
import { FileText, Plus, Search, Edit2, Trash2, Copy, Play, Download, Upload, FolderOpen, Tag, X, Code, Eye, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import styles from './DocumentAutomationPage.module.css'

interface DocumentTemplate {
  id: string
  name: string
  description: string
  category: string
  documentType: string
  variables: TemplateVariable[]
  lastUsed?: string
  usageCount: number
  createdAt: string
}

interface TemplateVariable {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'client' | 'matter' | 'user'
  required: boolean
  defaultValue?: string
  options?: string[]
}

const demoTemplates: DocumentTemplate[] = [
  { id: '1', name: 'Engagement Letter - Litigation', description: 'Standard engagement letter for litigation matters', category: 'Engagement', documentType: 'docx', variables: [{ key: 'client_name', label: 'Client Name', type: 'client', required: true }, { key: 'matter_name', label: 'Matter Name', type: 'matter', required: true }, { key: 'retainer_amount', label: 'Retainer Amount', type: 'number', required: true }, { key: 'hourly_rate', label: 'Hourly Rate', type: 'number', required: true }], lastUsed: '2024-11-20', usageCount: 45, createdAt: '2024-01-15' },
  { id: '2', name: 'Fee Agreement - Contingency', description: 'Contingency fee agreement for personal injury cases', category: 'Engagement', documentType: 'docx', variables: [{ key: 'client_name', label: 'Client Name', type: 'client', required: true }, { key: 'contingency_percent', label: 'Contingency %', type: 'number', required: true }], lastUsed: '2024-11-18', usageCount: 28, createdAt: '2024-02-10' },
  { id: '3', name: 'Demand Letter', description: 'Pre-litigation demand letter template', category: 'Correspondence', documentType: 'docx', variables: [{ key: 'client_name', label: 'Client Name', type: 'client', required: true }, { key: 'opposing_party', label: 'Opposing Party', type: 'text', required: true }, { key: 'demand_amount', label: 'Demand Amount', type: 'number', required: true }, { key: 'incident_date', label: 'Incident Date', type: 'date', required: true }], lastUsed: '2024-11-22', usageCount: 67, createdAt: '2024-01-20' },
  { id: '4', name: 'Motion to Dismiss', description: 'Motion to dismiss for failure to state a claim', category: 'Pleadings', documentType: 'docx', variables: [{ key: 'court_name', label: 'Court Name', type: 'text', required: true }, { key: 'case_number', label: 'Case Number', type: 'text', required: true }, { key: 'client_name', label: 'Client Name', type: 'client', required: true }], usageCount: 12, createdAt: '2024-03-01' },
  { id: '5', name: 'Discovery Requests - Interrogatories', description: 'Standard set of interrogatories', category: 'Discovery', documentType: 'docx', variables: [{ key: 'client_name', label: 'Client Name', type: 'client', required: true }, { key: 'opposing_party', label: 'Opposing Party', type: 'text', required: true }], lastUsed: '2024-11-15', usageCount: 34, createdAt: '2024-02-15' },
  { id: '6', name: 'Settlement Agreement', description: 'Comprehensive settlement agreement template', category: 'Agreements', documentType: 'docx', variables: [{ key: 'party_a', label: 'Party A', type: 'text', required: true }, { key: 'party_b', label: 'Party B', type: 'text', required: true }, { key: 'settlement_amount', label: 'Settlement Amount', type: 'number', required: true }], lastUsed: '2024-11-10', usageCount: 23, createdAt: '2024-01-25' },
]

const mergeFields = [
  { category: 'Client', fields: ['{{client.name}}', '{{client.address}}', '{{client.email}}', '{{client.phone}}'] },
  { category: 'Matter', fields: ['{{matter.name}}', '{{matter.number}}', '{{matter.type}}', '{{matter.open_date}}'] },
  { category: 'Firm', fields: ['{{firm.name}}', '{{firm.address}}', '{{firm.phone}}', '{{firm.email}}'] },
  { category: 'User', fields: ['{{user.name}}', '{{user.title}}', '{{user.email}}', '{{user.bar_number}}'] },
  { category: 'Date', fields: ['{{today}}', '{{today_long}}', '{{current_year}}'] },
]

const categories = ['All', 'Engagement', 'Correspondence', 'Pleadings', 'Discovery', 'Agreements', 'Corporate']

export function DocumentAutomationPage() {
  const [templates] = useState(demoTemplates)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showMergeFields, setShowMergeFields] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null)

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className={styles.docAutoPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><Sparkles size={28} /></div>
          <div>
            <h1>Document Automation</h1>
            <p>Create documents instantly with merge fields and templates</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn} onClick={() => setShowMergeFields(true)}><Code size={18} /> Merge Fields</button>
          <button className={styles.primaryBtn}><Plus size={18} /> New Template</button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input type="text" placeholder="Search templates..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className={styles.categoryTabs}>
          {categories.map(cat => (
            <button key={cat} className={clsx(styles.categoryTab, categoryFilter === cat && styles.active)} onClick={() => setCategoryFilter(cat)}>{cat}</button>
          ))}
        </div>
      </div>

      <div className={styles.templatesGrid}>
        {filteredTemplates.map(template => (
          <div key={template.id} className={styles.templateCard}>
            <div className={styles.templateIcon}><FileText size={32} /></div>
            <div className={styles.templateContent}>
              <h3>{template.name}</h3>
              <p>{template.description}</p>
              <div className={styles.templateMeta}>
                <span className={styles.categoryBadge}>{template.category}</span>
                <span className={styles.usageCount}>{template.usageCount} uses</span>
                <span className={styles.variables}>{template.variables.length} variables</span>
              </div>
            </div>
            <div className={styles.templateActions}>
              <button className={styles.generateBtn} onClick={() => { setSelectedTemplate(template); setShowGenerateModal(true); }}><Play size={16} /> Generate</button>
              <button className={styles.iconBtn}><Eye size={16} /></button>
              <button className={styles.iconBtn}><Edit2 size={16} /></button>
              <button className={styles.iconBtn}><Copy size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {showMergeFields && (
        <div className={styles.modalOverlay} onClick={() => setShowMergeFields(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Available Merge Fields</h2>
              <button onClick={() => setShowMergeFields(false)} className={styles.closeBtn}><X size={20} /></button>
            </div>
            <div className={styles.mergeFieldsList}>
              {mergeFields.map(group => (
                <div key={group.category} className={styles.mergeGroup}>
                  <h4>{group.category}</h4>
                  <div className={styles.mergeFieldsGrid}>
                    {group.fields.map(field => (
                      <code key={field} className={styles.mergeField}>{field}</code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showGenerateModal && selectedTemplate && (
        <div className={styles.modalOverlay} onClick={() => setShowGenerateModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Generate: {selectedTemplate.name}</h2>
              <button onClick={() => setShowGenerateModal(false)} className={styles.closeBtn}><X size={20} /></button>
            </div>
            <form className={styles.modalForm}>
              {selectedTemplate.variables.map(v => (
                <div key={v.key} className={styles.formGroup}>
                  <label>{v.label} {v.required && '*'}</label>
                  {v.type === 'select' ? (
                    <select>{v.options?.map(o => <option key={o}>{o}</option>)}</select>
                  ) : v.type === 'date' ? (
                    <input type="date" />
                  ) : (
                    <input type={v.type === 'number' ? 'number' : 'text'} placeholder={`Enter ${v.label.toLowerCase()}`} />
                  )}
                </div>
              ))}
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setShowGenerateModal(false)} className={styles.cancelBtn}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}><Download size={16} /> Generate Document</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

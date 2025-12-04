import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TextSelect, Plus, Search, Edit2, Trash2, X, Copy, Check,
  FolderOpen, Tag, ChevronDown, Clock, ArrowLeft
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './TextSnippetsPage.module.css'

interface TextSnippet {
  id: string
  shortcut: string
  title: string
  content: string
  category: string
  createdAt: string
  usageCount: number
}

const demoSnippets: TextSnippet[] = [
  {
    id: '1',
    shortcut: '/loi',
    title: 'Letter of Intent Opening',
    content: 'Dear [Client Name],\n\nThank you for choosing our firm to represent you in this matter. This letter confirms our engagement and outlines the scope of our representation.',
    category: 'Correspondence',
    createdAt: '2024-01-15',
    usageCount: 45
  },
  {
    id: '2',
    shortcut: '/conf',
    title: 'Confidentiality Notice',
    content: 'CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGED\n\nThis communication contains privileged and confidential information intended only for the addressee. If you are not the intended recipient, please notify the sender immediately and delete this message.',
    category: 'Legal Notices',
    createdAt: '2024-01-20',
    usageCount: 128
  },
  {
    id: '3',
    shortcut: '/sig',
    title: 'Email Signature',
    content: 'Best regards,\n\n[Your Name]\n[Title]\n[Firm Name]\n[Phone] | [Email]\n\nThis email may contain confidential information.',
    category: 'Email',
    createdAt: '2024-02-01',
    usageCount: 312
  },
  {
    id: '4',
    shortcut: '/disc',
    title: 'Discovery Response Intro',
    content: 'COMES NOW [Party Name], by and through undersigned counsel, and hereby responds to the [Discovery Type] propounded by [Opposing Party] as follows:',
    category: 'Discovery',
    createdAt: '2024-02-15',
    usageCount: 67
  },
  {
    id: '5',
    shortcut: '/obj',
    title: 'General Objection',
    content: '[Party Name] objects to this request on the grounds that it is overly broad, unduly burdensome, and not reasonably calculated to lead to the discovery of admissible evidence.',
    category: 'Discovery',
    createdAt: '2024-03-01',
    usageCount: 89
  },
  {
    id: '6',
    shortcut: '/bill',
    title: 'Billing Reminder',
    content: 'Dear [Client Name],\n\nPlease find attached our invoice for services rendered through [Date]. Payment is due within 30 days of receipt. If you have any questions about this invoice, please do not hesitate to contact us.',
    category: 'Billing',
    createdAt: '2024-03-10',
    usageCount: 34
  }
]

const categories = ['All', 'Correspondence', 'Legal Notices', 'Email', 'Discovery', 'Billing', 'Court']

export function TextSnippetsPage() {
  const navigate = useNavigate()
  const [snippets, setSnippets] = useState(demoSnippets)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [editingSnippet, setEditingSnippet] = useState<TextSnippet | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filteredSnippets = snippets.filter(snippet => {
    const matchesSearch = snippet.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         snippet.shortcut.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         snippet.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || snippet.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleCopy = async (snippet: TextSnippet) => {
    await navigator.clipboard.writeText(snippet.content)
    setCopiedId(snippet.id)
    setTimeout(() => setCopiedId(null), 2000)
    // Increment usage count
    setSnippets(prev => prev.map(s => s.id === snippet.id ? { ...s, usageCount: s.usageCount + 1 } : s))
  }

  const handleSaveSnippet = (data: Partial<TextSnippet>) => {
    if (editingSnippet) {
      setSnippets(prev => prev.map(s => s.id === editingSnippet.id ? { ...s, ...data } : s))
    } else {
      const newSnippet: TextSnippet = {
        id: Date.now().toString(),
        shortcut: data.shortcut || '',
        title: data.title || '',
        content: data.content || '',
        category: data.category || 'Correspondence',
        createdAt: new Date().toISOString().split('T')[0],
        usageCount: 0
      }
      setSnippets(prev => [...prev, newSnippet])
    }
    setShowModal(false)
    setEditingSnippet(null)
  }

  const handleDeleteSnippet = (snippetId: string) => {
    setSnippets(prev => prev.filter(s => s.id !== snippetId))
  }

  return (
    <div className={styles.textSnippetsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <TextSelect size={28} />
        </div>
        <div className={styles.headerContent}>
          <h1>Text Snippets</h1>
          <p>Create reusable text snippets with shortcuts. Type the shortcut anywhere to insert the snippet.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => setShowModal(true)}>
          <Plus size={18} />
          New Snippet
        </button>
      </div>

      {/* How it works */}
      <div className={styles.howItWorks}>
        <h3>How it works</h3>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNumber}>1</span>
            <span>Create a snippet with a shortcut (e.g., <code>/sig</code>)</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>2</span>
            <span>Type the shortcut in any text field</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>3</span>
            <span>Press <kbd>Tab</kbd> or <kbd>Enter</kbd> to insert the snippet</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search snippets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.categoryTabs}>
          {categories.map(cat => (
            <button
              key={cat}
              className={clsx(styles.categoryTab, categoryFilter === cat && styles.active)}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Snippets Grid */}
      <div className={styles.snippetsGrid}>
        {filteredSnippets.map(snippet => (
          <div key={snippet.id} className={styles.snippetCard}>
            <div className={styles.snippetHeader}>
              <code className={styles.shortcut}>{snippet.shortcut}</code>
              <span className={styles.category}>{snippet.category}</span>
            </div>
            <h3 className={styles.snippetTitle}>{snippet.title}</h3>
            <p className={styles.snippetContent}>{snippet.content}</p>
            <div className={styles.snippetMeta}>
              <span className={styles.usageCount}>
                <Clock size={14} /> Used {snippet.usageCount} times
              </span>
            </div>
            <div className={styles.snippetActions}>
              <button
                className={clsx(styles.copyBtn, copiedId === snippet.id && styles.copied)}
                onClick={() => handleCopy(snippet)}
              >
                {copiedId === snippet.id ? (
                  <><Check size={16} /> Copied!</>
                ) : (
                  <><Copy size={16} /> Copy</>
                )}
              </button>
              <button
                className={styles.iconBtn}
                onClick={() => {
                  setEditingSnippet(snippet)
                  setShowModal(true)
                }}
              >
                <Edit2 size={16} />
              </button>
              <button
                className={styles.iconBtnDanger}
                onClick={() => handleDeleteSnippet(snippet.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {filteredSnippets.length === 0 && (
          <div className={styles.emptyState}>
            <TextSelect size={48} />
            <h3>No Snippets Found</h3>
            <p>Create text snippets to save time on repetitive typing tasks.</p>
            <button className={styles.primaryBtn} onClick={() => setShowModal(true)}>
              <Plus size={18} />
              Create Your First Snippet
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <SnippetModal
          snippet={editingSnippet}
          categories={categories.filter(c => c !== 'All')}
          onClose={() => {
            setShowModal(false)
            setEditingSnippet(null)
          }}
          onSave={handleSaveSnippet}
        />
      )}
    </div>
  )
}

function SnippetModal({
  snippet,
  categories,
  onClose,
  onSave
}: {
  snippet: TextSnippet | null
  categories: string[]
  onClose: () => void
  onSave: (data: Partial<TextSnippet>) => void
}) {
  const [formData, setFormData] = useState({
    shortcut: snippet?.shortcut || '/',
    title: snippet?.title || '',
    content: snippet?.content || '',
    category: snippet?.category || 'Correspondence'
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{snippet ? 'Edit Snippet' : 'New Snippet'}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Shortcut *</label>
              <input
                type="text"
                value={formData.shortcut}
                onChange={e => {
                  let value = e.target.value
                  if (!value.startsWith('/')) value = '/' + value
                  setFormData({ ...formData, shortcut: value.toLowerCase().replace(/\s/g, '') })
                }}
                placeholder="/shortcut"
                required
              />
              <span className={styles.hint}>Must start with /</span>
            </div>
            <div className={styles.formGroup}>
              <label>Category *</label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Email Signature"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Content *</label>
            <textarea
              value={formData.content}
              onChange={e => setFormData({ ...formData, content: e.target.value })}
              placeholder="Enter the snippet text. Use [Placeholder] for dynamic content."
              rows={8}
              required
            />
            <span className={styles.hint}>Tip: Use [Placeholder Text] for parts that change each time</span>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}>
              {snippet ? 'Save Changes' : 'Create Snippet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

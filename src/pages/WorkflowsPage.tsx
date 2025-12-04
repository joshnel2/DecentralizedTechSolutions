import { useState } from 'react'
import { Workflow, Plus, Play, Pause, Edit2, Trash2, Copy, Zap, Mail, Calendar, FileText, Bell, CheckCircle2, Clock, Users, ArrowRight, X } from 'lucide-react'
import { clsx } from 'clsx'
import styles from './WorkflowsPage.module.css'

interface WorkflowTemplate {
  id: string
  name: string
  description: string
  trigger: string
  actions: number
  isActive: boolean
  runCount: number
  lastRun?: string
  category: string
}

const demoWorkflows: WorkflowTemplate[] = [
  { id: '1', name: 'New Client Intake', description: 'Send welcome email, create tasks, and schedule initial consultation when new client is added', trigger: 'Client Created', actions: 4, isActive: true, runCount: 45, lastRun: '2 hours ago', category: 'Client' },
  { id: '2', name: 'Matter Opening Checklist', description: 'Create standard tasks and calendar events when a new matter is opened', trigger: 'Matter Created', actions: 6, isActive: true, runCount: 32, lastRun: '1 day ago', category: 'Matter' },
  { id: '3', name: 'Deadline Reminder', description: 'Send email and notification reminders 7, 3, and 1 days before deadlines', trigger: 'Deadline Approaching', actions: 3, isActive: true, runCount: 156, lastRun: '30 min ago', category: 'Calendar' },
  { id: '4', name: 'Invoice Follow-up', description: 'Send reminder emails for overdue invoices at 7, 14, and 30 days', trigger: 'Invoice Overdue', actions: 3, isActive: true, runCount: 28, lastRun: '3 days ago', category: 'Billing' },
  { id: '5', name: 'Document Upload Notification', description: 'Notify assigned attorneys when documents are uploaded to a matter', trigger: 'Document Uploaded', actions: 2, isActive: false, runCount: 89, category: 'Documents' },
  { id: '6', name: 'Trust Balance Alert', description: 'Alert when client trust balance falls below threshold', trigger: 'Trust Balance Low', actions: 2, isActive: true, runCount: 12, lastRun: '5 days ago', category: 'Trust' },
]

const triggerOptions = [
  { value: 'client_created', label: 'Client Created', icon: Users },
  { value: 'matter_created', label: 'Matter Created', icon: FileText },
  { value: 'task_completed', label: 'Task Completed', icon: CheckCircle2 },
  { value: 'deadline_approaching', label: 'Deadline Approaching', icon: Clock },
  { value: 'invoice_overdue', label: 'Invoice Overdue', icon: Bell },
  { value: 'document_uploaded', label: 'Document Uploaded', icon: FileText },
  { value: 'time_entry_created', label: 'Time Entry Created', icon: Clock },
]

const actionOptions = [
  { value: 'send_email', label: 'Send Email', icon: Mail },
  { value: 'create_task', label: 'Create Task', icon: CheckCircle2 },
  { value: 'create_event', label: 'Create Calendar Event', icon: Calendar },
  { value: 'send_notification', label: 'Send Notification', icon: Bell },
  { value: 'update_field', label: 'Update Field', icon: Edit2 },
]

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState(demoWorkflows)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const toggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, isActive: !w.isActive } : w))
  }

  const activeCount = workflows.filter(w => w.isActive).length

  return (
    <div className={styles.workflowsPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><Workflow size={28} /></div>
          <div>
            <h1>Automated Workflows</h1>
            <p>Automate repetitive tasks and streamline your practice</p>
          </div>
        </div>
        <button className={styles.primaryBtn} onClick={() => setShowCreateModal(true)}><Plus size={18} /> Create Workflow</button>
      </div>

      <div className={styles.statsBar}>
        <div className={styles.stat}><Zap size={18} /><span>{workflows.length} Workflows</span></div>
        <div className={styles.stat}><Play size={18} /><span>{activeCount} Active</span></div>
        <div className={styles.stat}><CheckCircle2 size={18} /><span>{workflows.reduce((sum, w) => sum + w.runCount, 0)} Total Runs</span></div>
      </div>

      <div className={styles.workflowsGrid}>
        {workflows.map(workflow => (
          <div key={workflow.id} className={clsx(styles.workflowCard, !workflow.isActive && styles.inactive)}>
            <div className={styles.workflowHeader}>
              <div className={styles.workflowIcon}><Zap size={20} /></div>
              <div className={styles.workflowInfo}>
                <h3>{workflow.name}</h3>
                <span className={styles.category}>{workflow.category}</span>
              </div>
              <button className={clsx(styles.toggleBtn, workflow.isActive && styles.active)} onClick={() => toggleWorkflow(workflow.id)}>
                {workflow.isActive ? <><Play size={14} /> Active</> : <><Pause size={14} /> Paused</>}
              </button>
            </div>
            <p className={styles.workflowDesc}>{workflow.description}</p>
            <div className={styles.workflowMeta}>
              <div className={styles.metaItem}><Bell size={14} /> Trigger: {workflow.trigger}</div>
              <div className={styles.metaItem}><Zap size={14} /> {workflow.actions} actions</div>
              <div className={styles.metaItem}><CheckCircle2 size={14} /> {workflow.runCount} runs</div>
              {workflow.lastRun && <div className={styles.metaItem}><Clock size={14} /> Last: {workflow.lastRun}</div>}
            </div>
            <div className={styles.workflowActions}>
              <button className={styles.actionBtn} onClick={() => alert(`Editing workflow: ${workflow.name}\n\nThis would open the workflow editor.`)}><Edit2 size={14} /> Edit</button>
              <button className={styles.actionBtn} onClick={() => alert(`Workflow "${workflow.name}" duplicated!\n\nNew workflow created: ${workflow.name} (Copy)`)}><Copy size={14} /> Duplicate</button>
              <button className={styles.actionBtn} onClick={() => alert(`Test run started for: ${workflow.name}\n\nWorkflow executed successfully with test data.`)}><Play size={14} /> Test Run</button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.templatesSection}>
        <h2>Quick Start Templates</h2>
        <div className={styles.templatesGrid}>
          <div className={styles.templateCard}>
            <Users size={24} />
            <h4>Client Onboarding</h4>
            <p>Welcome emails, intake tasks, and document requests</p>
            <button className={styles.useBtn} onClick={() => { alert('Client Onboarding template selected!\n\nA new workflow will be created with:\n• Welcome email trigger\n• Intake task creation\n• Document request automation'); setShowCreateModal(true); }}>Use Template</button>
          </div>
          <div className={styles.templateCard}>
            <Calendar size={24} />
            <h4>Court Deadline Alerts</h4>
            <p>Multi-stage reminders for court filing deadlines</p>
            <button className={styles.useBtn} onClick={() => { alert('Court Deadline Alerts template selected!\n\nA new workflow will be created with:\n• 30-day, 7-day, and 1-day reminders\n• Email and in-app notifications'); setShowCreateModal(true); }}>Use Template</button>
          </div>
          <div className={styles.templateCard}>
            <Mail size={24} />
            <h4>Invoice Collection</h4>
            <p>Automated payment reminder sequence</p>
            <button className={styles.useBtn} onClick={() => { alert('Invoice Collection template selected!\n\nA new workflow will be created with:\n• Overdue invoice triggers\n• Progressive reminder emails'); setShowCreateModal(true); }}>Use Template</button>
          </div>
          <div className={styles.templateCard}>
            <FileText size={24} />
            <h4>Matter Closing</h4>
            <p>Final billing, file archiving, and client survey</p>
            <button className={styles.useBtn} onClick={() => { alert('Matter Closing template selected!\n\nA new workflow will be created with:\n• Final invoice generation\n• Document archiving\n• Client satisfaction survey'); setShowCreateModal(true); }}>Use Template</button>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create Workflow</h2>
              <button onClick={() => setShowCreateModal(false)} className={styles.closeBtn}><X size={20} /></button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.formGroup}><label>Workflow Name *</label><input type="text" placeholder="e.g., New Client Welcome" /></div>
              <div className={styles.formGroup}><label>Description</label><textarea rows={2} placeholder="What does this workflow do?" /></div>
              <div className={styles.formGroup}>
                <label>Trigger *</label>
                <div className={styles.triggerGrid}>
                  {triggerOptions.map(t => (
                    <button key={t.value} className={styles.triggerOption} onClick={() => alert(`Trigger selected: ${t.label}`)}><t.icon size={18} /> {t.label}</button>
                  ))}
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Actions</label>
                <div className={styles.actionsBuilder}>
                  <div className={styles.actionStep}><span className={styles.stepNumber}>1</span><Mail size={16} /> Send welcome email <ArrowRight size={14} /></div>
                  <button className={styles.addActionBtn} onClick={() => alert('Action types available:\n\n• Send Email\n• Create Task\n• Send SMS\n• Create Document\n• Update Field\n• Wait/Delay')}><Plus size={16} /> Add Action</button>
                </div>
              </div>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className={styles.primaryBtn}><Zap size={16} /> Create Workflow</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

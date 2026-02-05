/**
 * OnboardingWizard Component
 * Guides new users through initial setup steps
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  X, ChevronRight, ChevronLeft, Check, Rocket, Users, Briefcase, 
  FolderOpen, Calendar, DollarSign, Settings, Sparkles, Shield,
  Building2, Mail, Cloud, Link2, CheckCircle2, ArrowRight
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { clsx } from 'clsx'
import styles from './OnboardingWizard.module.css'

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: any
  action?: string
  actionPath?: string
  isComplete?: boolean
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'profile',
    title: 'Complete Your Profile',
    description: 'Add your name, photo, and contact information',
    icon: Users,
    action: 'Update Profile',
    actionPath: '/app/settings/profile'
  },
  {
    id: 'firm',
    title: 'Set Up Your Firm',
    description: 'Configure firm name, logo, and practice areas',
    icon: Building2,
    action: 'Firm Settings',
    actionPath: '/app/settings/firm'
  },
  {
    id: 'integrations',
    title: 'Connect Your Tools',
    description: 'Link Outlook, QuickBooks, OneDrive, and more',
    icon: Link2,
    action: 'View Integrations',
    actionPath: '/app/settings/integrations'
  },
  {
    id: 'matter',
    title: 'Create Your First Matter',
    description: 'Set up a client and matter to start tracking work',
    icon: Briefcase,
    action: 'Create Matter',
    actionPath: '/app/matters'
  },
  {
    id: 'documents',
    title: 'Upload Documents',
    description: 'Add documents to your Apex Drive',
    icon: FolderOpen,
    action: 'Go to Documents',
    actionPath: '/app/documents'
  },
  {
    id: 'ai',
    title: 'Try the AI Assistant',
    description: 'Ask a question or run a background task',
    icon: Sparkles,
    action: 'Open AI Assistant',
    actionPath: '/app/ai'
  }
]

interface OnboardingWizardProps {
  onClose: () => void
  onComplete?: () => void
}

export function OnboardingWizard({ onClose, onComplete }: OnboardingWizardProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [showFullWizard, setShowFullWizard] = useState(false)

  // Load completed steps from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`onboarding-${user?.id}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setCompletedSteps(new Set(parsed.completed || []))
      } catch { /* ignore */ }
    }
  }, [user?.id])

  // Save completed steps
  const markComplete = (stepId: string) => {
    const newCompleted = new Set(completedSteps)
    newCompleted.add(stepId)
    setCompletedSteps(newCompleted)
    localStorage.setItem(`onboarding-${user?.id}`, JSON.stringify({
      completed: Array.from(newCompleted)
    }))
  }

  const handleStepAction = (step: OnboardingStep) => {
    markComplete(step.id)
    if (step.actionPath) {
      navigate(step.actionPath)
      onClose()
    }
  }

  const handleSkip = () => {
    localStorage.setItem(`onboarding-${user?.id}`, JSON.stringify({
      completed: ONBOARDING_STEPS.map(s => s.id),
      skipped: true
    }))
    onClose()
  }

  const progress = Math.round((completedSteps.size / ONBOARDING_STEPS.length) * 100)
  const currentStepData = ONBOARDING_STEPS[currentStep]

  if (!showFullWizard) {
    // Show compact welcome card
    return (
      <div className={styles.welcomeCard}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
        <div className={styles.welcomeIcon}>
          <Rocket size={28} />
        </div>
        <h2>Welcome to Apex Legal! 👋</h2>
        <p>Let's get you set up. Complete these quick steps to get the most out of your practice management.</p>
        
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.progressText}>{completedSteps.size} of {ONBOARDING_STEPS.length} steps complete</span>
        
        <div className={styles.quickSteps}>
          {ONBOARDING_STEPS.slice(0, 3).map(step => {
            const Icon = step.icon
            const isComplete = completedSteps.has(step.id)
            return (
              <button 
                key={step.id} 
                className={clsx(styles.quickStep, isComplete && styles.complete)}
                onClick={() => handleStepAction(step)}
              >
                {isComplete ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                <span>{step.title}</span>
                <ChevronRight size={14} />
              </button>
            )
          })}
        </div>
        
        <div className={styles.welcomeActions}>
          <button className={styles.expandBtn} onClick={() => setShowFullWizard(true)}>
            View All Steps
          </button>
          <button className={styles.skipBtn} onClick={handleSkip}>
            I'll explore on my own
          </button>
        </div>
      </div>
    )
  }

  // Full wizard view
  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className={styles.wizardHeader}>
          <h2>Getting Started</h2>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <span className={styles.progressText}>{progress}% complete</span>
        </div>
        
        <div className={styles.wizardContent}>
          <div className={styles.stepsList}>
            {ONBOARDING_STEPS.map((step, index) => {
              const Icon = step.icon
              const isComplete = completedSteps.has(step.id)
              const isCurrent = index === currentStep
              
              return (
                <button
                  key={step.id}
                  className={clsx(
                    styles.stepItem,
                    isComplete && styles.complete,
                    isCurrent && styles.current
                  )}
                  onClick={() => setCurrentStep(index)}
                >
                  <div className={styles.stepIcon}>
                    {isComplete ? <Check size={16} /> : <Icon size={16} />}
                  </div>
                  <span className={styles.stepTitle}>{step.title}</span>
                  {isComplete && <CheckCircle2 size={14} className={styles.checkIcon} />}
                </button>
              )
            })}
          </div>
          
          <div className={styles.stepDetail}>
            <div className={styles.stepDetailIcon}>
              <currentStepData.icon size={40} />
            </div>
            <h3>{currentStepData.title}</h3>
            <p>{currentStepData.description}</p>
            
            {currentStepData.action && (
              <button 
                className={styles.actionBtn}
                onClick={() => handleStepAction(currentStepData)}
              >
                {currentStepData.action}
                <ArrowRight size={16} />
              </button>
            )}
            
            <div className={styles.stepNavigation}>
              <button 
                className={styles.navBtn}
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button 
                className={styles.navBtn}
                onClick={() => setCurrentStep(Math.min(ONBOARDING_STEPS.length - 1, currentStep + 1))}
                disabled={currentStep === ONBOARDING_STEPS.length - 1}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
        
        <div className={styles.wizardFooter}>
          <button className={styles.skipBtn} onClick={handleSkip}>
            Skip Setup
          </button>
          {completedSteps.size === ONBOARDING_STEPS.length && (
            <button className={styles.completeBtn} onClick={() => { onComplete?.(); onClose(); }}>
              <Check size={16} />
              All Done!
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Hook to check if onboarding should show
export function useOnboarding() {
  const { user } = useAuthStore()
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    
    const saved = localStorage.getItem(`onboarding-${user.id}`)
    if (!saved) {
      // First time user - show onboarding
      setShouldShow(true)
    } else {
      try {
        const parsed = JSON.parse(saved)
        // Show if not skipped and not fully complete
        if (!parsed.skipped && parsed.completed?.length < 6) {
          setShouldShow(true)
        }
      } catch { /* ignore */ }
    }
  }, [user?.id])

  return { shouldShow, setShouldShow }
}

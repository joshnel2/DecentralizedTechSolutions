import { useState, useMemo, useEffect } from 'react'
import { useDataStore } from '../stores/dataStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Clock, MapPin, Users, Sparkles
} from 'lucide-react'
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, parseISO, addMonths, subMonths
} from 'date-fns'
import { clsx } from 'clsx'
import styles from './CalendarPage.module.css'

export function CalendarPage() {
  const { events, matters, clients, addEvent, fetchEvents, fetchMatters } = useDataStore()
  const { openChat } = useAIChat()
  
  // Fetch data from API on mount
  useEffect(() => {
    fetchEvents()
    fetchMatters()
  }, [fetchEvents, fetchMatters])
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [view, setView] = useState<'month' | 'week' | 'list'>('month')

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarStart = startOfWeek(monthStart)
    const calendarEnd = endOfWeek(monthEnd)
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [currentDate])

  const getEventsForDay = (date: Date) => {
    return events.filter(event => {
      const eventDate = parseISO(event.startTime)
      return isSameDay(eventDate, date)
    })
  }

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return []
    return getEventsForDay(selectedDate).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )
  }, [selectedDate, events])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return events
      .filter(e => new Date(e.startTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 10)
  }, [events])

  const getMatterName = (matterId?: string) => {
    if (!matterId) return null
    return matters.find(m => m.id === matterId)?.name
  }

  return (
    <div className={styles.calendarPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Calendar</h1>
          <div className={styles.monthNav}>
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft size={20} />
            </button>
            <span className={styles.currentMonth}>
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.viewToggle}>
            {(['month', 'week', 'list'] as const).map(v => (
              <button 
                key={v}
                className={clsx(view === v && styles.active)}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button className={styles.aiBtn} onClick={() => openChat()}>
            <Sparkles size={16} />
            AI Insights
          </button>
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <Plus size={18} />
            New Event
          </button>
        </div>
      </div>

      <div className={styles.calendarLayout}>
        {/* Calendar Grid */}
        <div className={styles.calendarMain}>
          <div className={styles.calendarGrid}>
            {/* Week day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className={styles.weekDay}>{day}</div>
            ))}
            
            {/* Calendar days */}
            {calendarDays.map(day => {
              const dayEvents = getEventsForDay(day)
              const isToday = isSameDay(day, new Date())
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isSelected = selectedDate && isSameDay(day, selectedDate)
              
              return (
                <div 
                  key={day.toISOString()}
                  className={clsx(
                    styles.calendarDay,
                    !isCurrentMonth && styles.otherMonth,
                    isToday && styles.today,
                    isSelected && styles.selected
                  )}
                  onClick={() => setSelectedDate(day)}
                >
                  <span className={styles.dayNumber}>{format(day, 'd')}</span>
                  <div className={styles.dayEvents}>
                    {dayEvents.slice(0, 3).map(event => (
                      <div 
                        key={event.id}
                        className={styles.eventDot}
                        style={{ background: event.color }}
                        title={event.title}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className={styles.moreEvents}>+{dayEvents.length - 3}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className={styles.sidebar}>
          {selectedDate ? (
            <div className={styles.selectedDatePanel}>
              <h3>{format(selectedDate, 'EEEE, MMMM d')}</h3>
              <div className={styles.selectedEvents}>
                {selectedDateEvents.length > 0 ? (
                  selectedDateEvents.map(event => (
                    <div 
                      key={event.id} 
                      className={styles.eventCard}
                      style={{ borderLeftColor: event.color }}
                    >
                      <div className={styles.eventTime}>
                        <Clock size={14} />
                        {format(parseISO(event.startTime), 'h:mm a')}
                        {!event.allDay && ` - ${format(parseISO(event.endTime), 'h:mm a')}`}
                      </div>
                      <h4>{event.title}</h4>
                      {event.description && <p>{event.description}</p>}
                      {event.location && (
                        <div className={styles.eventLocation}>
                          <MapPin size={12} />
                          {event.location}
                        </div>
                      )}
                      {getMatterName(event.matterId) && (
                        <div className={styles.eventMatter}>
                          {getMatterName(event.matterId)}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={styles.noEvents}>
                    <CalendarIcon size={32} />
                    <p>No events scheduled</p>
                    <button onClick={() => setShowNewModal(true)}>
                      Add Event
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.upcomingPanel}>
              <h3>Upcoming Events</h3>
              <div className={styles.upcomingList}>
                {upcomingEvents.map(event => (
                  <div 
                    key={event.id} 
                    className={styles.upcomingItem}
                    onClick={() => setSelectedDate(parseISO(event.startTime))}
                  >
                    <div 
                      className={styles.upcomingDot}
                      style={{ background: event.color }}
                    />
                    <div className={styles.upcomingContent}>
                      <span className={styles.upcomingTitle}>{event.title}</span>
                      <span className={styles.upcomingDate}>
                        {format(parseISO(event.startTime), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <span className={clsx(styles.eventType, styles[event.type])}>
                      {event.type.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewEventModal 
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            try {
              await addEvent(data)
              setShowNewModal(false)
              fetchEvents()
            } catch (error) {
              console.error('Failed to create event:', error)
              alert('Failed to create event. Please try again.')
            }
          }}
          matters={matters}
          defaultDate={selectedDate}
        />
      )}
    </div>
  )
}

function NewEventModal({ onClose, onSave, matters, defaultDate }: { onClose: () => void; onSave: (data: any) => Promise<void>; matters: any[]; defaultDate: Date | null }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'meeting',
    matterId: '',
    startTime: defaultDate ? format(defaultDate, "yyyy-MM-dd'T'09:00") : format(new Date(), "yyyy-MM-dd'T'09:00"),
    endTime: defaultDate ? format(defaultDate, "yyyy-MM-dd'T'10:00") : format(new Date(), "yyyy-MM-dd'T'10:00"),
    allDay: false,
    location: '',
    attendees: [],
    reminders: [{ type: 'notification', minutes: 15 }],
    color: '#3B82F6'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString()
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>New Event</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="Event title"
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                <option value="meeting">Meeting</option>
                <option value="deadline">Deadline</option>
                <option value="court_date">Court Date</option>
                <option value="reminder">Reminder</option>
                <option value="task">Task</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Color</label>
              <div className={styles.colorPicker}>
                {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'].map(color => (
                  <button
                    key={color}
                    type="button"
                    className={clsx(styles.colorOption, formData.color === color && styles.selected)}
                    style={{ background: color }}
                    onClick={() => setFormData({...formData, color})}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Start</label>
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>End</label>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                required
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Related Matter (optional)</label>
            <select
              value={formData.matterId}
              onChange={(e) => setFormData({...formData, matterId: e.target.value})}
            >
              <option value="">None</option>
              {matters.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
              placeholder="Location or video conference link"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Event description"
              rows={3}
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Browser Notifications Utility
 * Handles push notifications for background task completion
 */

// Check if notifications are supported
export function isNotificationSupported(): boolean {
  return 'Notification' in window
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    return 'denied'
  }
  
  if (Notification.permission === 'granted') {
    return 'granted'
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission
  }
  
  return Notification.permission
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported'
  }
  return Notification.permission
}

// Show a notification
export function showNotification(
  title: string, 
  options?: {
    body?: string
    icon?: string
    tag?: string
    requireInteraction?: boolean
    data?: any
    onClick?: () => void
  }
): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null
  }
  
  const notification = new Notification(title, {
    body: options?.body,
    icon: options?.icon || '/apex-icon.png',
    tag: options?.tag,
    requireInteraction: options?.requireInteraction || false,
    data: options?.data
  })
  
  if (options?.onClick) {
    notification.onclick = () => {
      window.focus()
      options.onClick?.()
      notification.close()
    }
  }
  
  return notification
}

// Task-specific notifications
export function notifyTaskComplete(task: {
  id: string
  goal: string
  status: 'completed' | 'failed' | 'cancelled'
  summary?: string
}, onClick?: () => void): Notification | null {
  const statusEmoji = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⚠️'
  const statusText = task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : 'cancelled'
  
  return showNotification(
    `${statusEmoji} Task ${statusText}`,
    {
      body: task.goal.substring(0, 100) + (task.goal.length > 100 ? '...' : ''),
      tag: `task-${task.id}`,
      requireInteraction: task.status === 'failed',
      data: { taskId: task.id },
      onClick
    }
  )
}

// Hook for managing notification state
import { useState, useEffect, useCallback } from 'react'

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [isSupported, setIsSupported] = useState(false)
  
  useEffect(() => {
    setIsSupported(isNotificationSupported())
    setPermission(getNotificationPermission())
  }, [])
  
  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
    return result
  }, [])
  
  const notify = useCallback((
    title: string,
    options?: Parameters<typeof showNotification>[1]
  ) => {
    return showNotification(title, options)
  }, [])
  
  const notifyTask = useCallback((
    task: Parameters<typeof notifyTaskComplete>[0],
    onClick?: () => void
  ) => {
    return notifyTaskComplete(task, onClick)
  }, [])
  
  return {
    isSupported,
    permission,
    isEnabled: permission === 'granted',
    requestPermission,
    notify,
    notifyTask
  }
}

import { useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import styles from './VirtualizedTable.module.css'

interface VirtualizedTableProps<T> {
  data: T[]
  rowHeight: number
  overscan?: number // Extra rows to render above/below viewport
  headers: ReactNode
  renderRow: (item: T, index: number) => ReactNode
  emptyState?: ReactNode
  className?: string
}

/**
 * VirtualizedTable - Renders only visible rows for performance with large datasets.
 * Used for "All Matters" and "All Clients" views where there can be thousands of rows.
 */
export function VirtualizedTable<T extends { id: string }>({
  data,
  rowHeight,
  overscan = 5,
  headers,
  renderRow,
  emptyState,
  className = ''
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  // Calculate which rows to render
  const totalHeight = data.length * rowHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIndex = Math.min(
    data.length,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  )
  const visibleData = data.slice(startIndex, endIndex)
  const offsetY = startIndex * rowHeight

  // Handle scroll events with throttling for performance
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Update container height on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateHeight = () => {
      setContainerHeight(container.clientHeight)
    }

    updateHeight()
    
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  if (data.length === 0) {
    return (
      <div className={`${styles.container} ${className}`}>
        <table className={styles.table}>
          <thead>{headers}</thead>
        </table>
        {emptyState}
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={`${styles.container} ${className}`}
      onScroll={handleScroll}
    >
      <table className={styles.table}>
        <thead className={styles.stickyHeader}>{headers}</thead>
      </table>
      <div 
        className={styles.scrollArea}
        style={{ height: totalHeight }}
      >
        <table 
          className={styles.table}
          style={{ 
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0
          }}
        >
          <tbody>
            {visibleData.map((item, idx) => renderRow(item, startIndex + idx))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

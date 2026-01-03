import { useState, useEffect, useRef, useCallback, ReactNode } from 'react'

interface VirtualizedTableProps<T> {
  data: T[]
  rowHeight: number
  overscan?: number // Extra rows to render above/below viewport
  headers: ReactNode
  renderRow: (item: T, index: number) => ReactNode
  emptyState?: ReactNode
  tableClassName?: string
  containerClassName?: string
}

/**
 * VirtualizedTable - Renders only visible rows for performance with large datasets.
 * Used for "All Matters" and "All Clients" views where there can be thousands of rows.
 * 
 * This component is styling-transparent - it uses the parent's table styles.
 */
export function VirtualizedTable<T extends { id: string }>({
  data,
  rowHeight,
  overscan = 5,
  headers,
  renderRow,
  emptyState,
  tableClassName = '',
  containerClassName = ''
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

  // Handle scroll events
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
      <div className={containerClassName}>
        <table className={tableClassName}>
          <thead>{headers}</thead>
        </table>
        {emptyState}
      </div>
    )
  }

  // Calculate padding to position visible rows correctly
  const paddingTop = startIndex * rowHeight
  const paddingBottom = Math.max(0, (data.length - endIndex) * rowHeight)

  return (
    <div 
      ref={containerRef}
      className={containerClassName}
      onScroll={handleScroll}
      style={{
        height: 'calc(100vh - 280px)',
        minHeight: '400px',
        overflowY: 'auto',
        overflowX: 'auto'
      }}
    >
      <table className={tableClassName}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>{headers}</thead>
        <tbody>
          {/* Top spacer row to maintain scroll position */}
          {paddingTop > 0 && (
            <tr style={{ height: paddingTop }} aria-hidden="true">
              <td colSpan={100} style={{ padding: 0, border: 'none', background: 'transparent' }} />
            </tr>
          )}
          
          {/* Visible rows */}
          {visibleData.map((item, idx) => renderRow(item, startIndex + idx))}
          
          {/* Bottom spacer row to maintain total height */}
          {paddingBottom > 0 && (
            <tr style={{ height: paddingBottom }} aria-hidden="true">
              <td colSpan={100} style={{ padding: 0, border: 'none', background: 'transparent' }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

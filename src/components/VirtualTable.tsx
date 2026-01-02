import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

interface Column<T> {
  key: string
  header: string
  width?: string | number
  render?: (item: T, index: number) => React.ReactNode
  accessor?: keyof T
}

interface VirtualTableProps<T> {
  data: T[]
  columns: Column<T>[]
  rowHeight?: number
  maxHeight?: number | string
  onRowClick?: (item: T) => void
  selectedIds?: Set<string>
  onSelectAll?: () => void
  onSelectRow?: (id: string) => void
  getRowId?: (item: T) => string
  emptyMessage?: string
  className?: string
  headerClassName?: string
  rowClassName?: string | ((item: T) => string)
  showCheckboxes?: boolean
}

export function VirtualTable<T extends Record<string, any>>({
  data,
  columns,
  rowHeight = 48,
  maxHeight = 600,
  onRowClick,
  selectedIds,
  onSelectAll,
  onSelectRow,
  getRowId = (item) => item.id,
  emptyMessage = 'No data found',
  className = '',
  headerClassName = '',
  rowClassName = '',
  showCheckboxes = false
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10, // Render 10 extra rows above/below viewport for smoother scrolling
  })

  const allSelected = useMemo(() => {
    if (!selectedIds || data.length === 0) return false
    return data.every(item => selectedIds.has(getRowId(item)))
  }, [selectedIds, data, getRowId])

  const someSelected = useMemo(() => {
    if (!selectedIds || data.length === 0) return false
    return data.some(item => selectedIds.has(getRowId(item))) && !allSelected
  }, [selectedIds, data, getRowId, allSelected])

  if (data.length === 0) {
    return (
      <div style={{ 
        padding: '40px 20px', 
        textAlign: 'center', 
        color: 'var(--text-secondary)',
        background: 'var(--bg-secondary)',
        borderRadius: '8px'
      }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={className} style={{ width: '100%' }}>
      {/* Fixed Header */}
      <div 
        className={headerClassName}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--bg-tertiary, #1a1a2e)',
          borderBottom: '1px solid var(--border-primary)',
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderRadius: '8px 8px 0 0'
        }}
      >
        {showCheckboxes && (
          <div style={{ width: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={input => {
                if (input) input.indeterminate = someSelected
              }}
              onChange={onSelectAll}
              style={{ cursor: 'pointer', width: 16, height: 16 }}
            />
          </div>
        )}
        {columns.map(col => (
          <div 
            key={col.key} 
            style={{ 
              flex: col.width ? `0 0 ${typeof col.width === 'number' ? `${col.width}px` : col.width}` : 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Virtual Scrolling Container */}
      <div
        ref={parentRef}
        style={{
          height: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          overflow: 'auto',
          background: 'var(--bg-secondary)',
          borderRadius: '0 0 8px 8px'
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = data[virtualRow.index]
            const rowId = getRowId(item)
            const isSelected = selectedIds?.has(rowId)
            const rowClassValue = typeof rowClassName === 'function' ? rowClassName(item) : rowClassName

            return (
              <div
                key={rowId}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className={rowClassValue}
                  onClick={() => onRowClick?.(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    height: '100%',
                    borderBottom: '1px solid var(--border-primary)',
                    cursor: onRowClick ? 'pointer' : 'default',
                    background: isSelected ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {showCheckboxes && (
                    <div 
                      style={{ width: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected || false}
                        onChange={() => onSelectRow?.(rowId)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </div>
                  )}
                  {columns.map(col => (
                    <div 
                      key={col.key}
                      style={{ 
                        flex: col.width ? `0 0 ${typeof col.width === 'number' ? `${col.width}px` : col.width}` : 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {col.render 
                        ? col.render(item, virtualRow.index)
                        : col.accessor 
                          ? String(item[col.accessor] ?? '')
                          : ''
                      }
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer with count */}
      <div style={{
        padding: '8px 16px',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        background: 'var(--bg-tertiary, #1a1a2e)',
        borderTop: '1px solid var(--border-primary)',
        borderRadius: '0 0 8px 8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          {selectedIds && selectedIds.size > 0 
            ? `${selectedIds.size} of ${data.length.toLocaleString()} selected`
            : `${data.length.toLocaleString()} total`
          }
        </span>
        <span style={{ opacity: 0.7 }}>
          Virtual scrolling enabled
        </span>
      </div>
    </div>
  )
}

export default VirtualTable

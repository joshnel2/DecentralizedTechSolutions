import { useState, useMemo, ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import styles from './SortableTable.module.css'

export type SortDirection = 'asc' | 'desc' | null

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
  render?: (row: T, index: number) => ReactNode
  sortValue?: (row: T) => string | number | Date | null
}

interface SortableTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  defaultSort?: { key: string; direction: SortDirection }
  onRowClick?: (row: T) => void
  selectedRows?: Set<string>
  onSelectRow?: (id: string, event: React.MouseEvent) => void
  selectAll?: boolean
  onSelectAll?: (selected: boolean) => void
  emptyMessage?: string
  className?: string
  stickyHeader?: boolean
}

export function SortableTable<T extends Record<string, any>>({
  data,
  columns,
  keyField,
  defaultSort,
  onRowClick,
  selectedRows,
  onSelectRow,
  selectAll,
  onSelectAll,
  emptyMessage = 'No data available',
  className = '',
  stickyHeader = false
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key || null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSort?.direction || null)

  const handleSort = (column: Column<T>) => {
    if (!column.sortable) return

    if (sortKey === column.key) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortDirection(null)
        setSortKey(null)
      } else {
        setSortDirection('asc')
      }
    } else {
      setSortKey(column.key)
      setSortDirection('asc')
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data

    const column = columns.find(c => c.key === sortKey)
    if (!column) return data

    return [...data].sort((a, b) => {
      let aVal: any
      let bVal: any

      if (column.sortValue) {
        aVal = column.sortValue(a)
        bVal = column.sortValue(b)
      } else {
        aVal = a[column.key]
        bVal = b[column.key]
      }

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1

      // Handle dates
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDirection === 'asc' 
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime()
      }

      // Handle strings
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
        return sortDirection === 'asc' ? comparison : -comparison
      }

      // Handle numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      // Fallback to string comparison
      const aStr = String(aVal)
      const bStr = String(bVal)
      const comparison = aStr.localeCompare(bStr)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [data, sortKey, sortDirection, columns])

  const allSelected = selectedRows && data.length > 0 && data.every(row => selectedRows.has(String(row[keyField])))
  const someSelected = selectedRows && data.some(row => selectedRows.has(String(row[keyField])))

  const getSortIcon = (column: Column<T>) => {
    if (!column.sortable) return null

    if (sortKey !== column.key) {
      return <ChevronsUpDown size={14} className={styles.sortIconInactive} />
    }

    if (sortDirection === 'asc') {
      return <ChevronUp size={14} className={styles.sortIconActive} />
    }

    if (sortDirection === 'desc') {
      return <ChevronDown size={14} className={styles.sortIconActive} />
    }

    return <ChevronsUpDown size={14} className={styles.sortIconInactive} />
  }

  return (
    <div className={`${styles.tableWrapper} ${className}`}>
      <table className={styles.table}>
        <thead className={stickyHeader ? styles.stickyHeader : ''}>
          <tr>
            {onSelectRow && (
              <th className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => {
                    if (el) el.indeterminate = !!(someSelected && !allSelected)
                  }}
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                  className={styles.checkbox}
                />
              </th>
            )}
            {columns.map(column => (
              <th
                key={column.key}
                className={`${styles.th} ${column.sortable ? styles.sortable : ''} ${styles[`align${column.align || 'left'}`]}`}
                style={{ width: column.width }}
                onClick={() => handleSort(column)}
              >
                <span className={styles.headerContent}>
                  <span>{column.header}</span>
                  {getSortIcon(column)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td 
                colSpan={columns.length + (onSelectRow ? 1 : 0)} 
                className={styles.emptyCell}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, index) => {
              const rowId = String(row[keyField])
              const isSelected = selectedRows?.has(rowId)

              return (
                <tr
                  key={rowId}
                  className={`${styles.tr} ${isSelected ? styles.selected : ''} ${onRowClick ? styles.clickable : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {onSelectRow && (
                    <td className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={isSelected || false}
                        onChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectRow(rowId, e)
                        }}
                        className={styles.checkbox}
                      />
                    </td>
                  )}
                  {columns.map(column => (
                    <td
                      key={column.key}
                      className={`${styles.td} ${styles[`align${column.align || 'left'}`]}`}
                    >
                      {column.render 
                        ? column.render(row, index)
                        : row[column.key]
                      }
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

export default SortableTable

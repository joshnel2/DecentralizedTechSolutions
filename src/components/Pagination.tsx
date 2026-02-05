import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import styles from './Pagination.module.css'

interface PaginationProps {
  page: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  pageSize: number
  pageSizeOptions: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  hasNextPage: boolean
  hasPrevPage: boolean
}

/**
 * Reusable pagination component
 * Designed for law firm scale (1000s of matters/documents)
 */
export function Pagination({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  hasNextPage,
  hasPrevPage
}: PaginationProps) {
  // Generate page numbers to display (with ellipsis)
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const delta = 2 // Pages to show on each side of current
    
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= page - delta && i <= page + delta)
      ) {
        pages.push(i)
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis')
      }
    }
    
    return pages
  }
  
  if (totalItems === 0) return null
  
  return (
    <div className={styles.pagination}>
      <div className={styles.info}>
        Showing <strong>{startIndex}</strong> - <strong>{endIndex}</strong> of{' '}
        <strong>{totalItems.toLocaleString()}</strong>
      </div>
      
      <div className={styles.controls}>
        {/* Page size selector */}
        <div className={styles.pageSizeSelector}>
          <label>Show:</label>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={styles.pageSizeSelect}
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
        
        {/* Navigation buttons */}
        <div className={styles.nav}>
          <button
            className={styles.navBtn}
            onClick={() => onPageChange(1)}
            disabled={!hasPrevPage}
            title="First page"
          >
            <ChevronsLeft size={16} />
          </button>
          
          <button
            className={styles.navBtn}
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrevPage}
            title="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          
          {/* Page numbers */}
          <div className={styles.pages}>
            {getPageNumbers().map((p, index) => (
              p === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className={styles.ellipsis}>...</span>
              ) : (
                <button
                  key={p}
                  className={`${styles.pageBtn} ${p === page ? styles.active : ''}`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              )
            ))}
          </div>
          
          <button
            className={styles.navBtn}
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage}
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>
          
          <button
            className={styles.navBtn}
            onClick={() => onPageChange(totalPages)}
            disabled={!hasNextPage}
            title="Last page"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

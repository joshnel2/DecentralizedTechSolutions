import { useState, useCallback, useMemo } from 'react'

interface _PaginationState {
  page: number
  pageSize: number
  total: number
}

interface UsePaginatedDataOptions<T> {
  data: T[]
  defaultPageSize?: number
  pageSizeOptions?: number[]
}

interface UsePaginatedDataReturn<T> {
  // Current page data
  pageData: T[]
  
  // Pagination state
  page: number
  pageSize: number
  totalPages: number
  totalItems: number
  
  // Navigation
  goToPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
  setPageSize: (size: number) => void
  
  // Info
  startIndex: number
  endIndex: number
  hasNextPage: boolean
  hasPrevPage: boolean
  pageSizeOptions: number[]
}

/**
 * Hook for client-side pagination
 * Optimized for 70-attorney firms with large datasets
 */
export function usePaginatedData<T>({
  data,
  defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100]
}: UsePaginatedDataOptions<T>): UsePaginatedDataReturn<T> {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  
  const totalItems = data.length
  const totalPages = Math.ceil(totalItems / pageSize)
  
  // Memoize page data to avoid recalculating on every render
  const pageData = useMemo(() => {
    const startIndex = (page - 1) * pageSize
    return data.slice(startIndex, startIndex + pageSize)
  }, [data, page, pageSize])
  
  const startIndex = (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, totalItems)
  
  const goToPage = useCallback((newPage: number) => {
    const validPage = Math.max(1, Math.min(newPage, totalPages))
    setPage(validPage)
  }, [totalPages])
  
  const nextPage = useCallback(() => {
    if (page < totalPages) {
      setPage(p => p + 1)
    }
  }, [page, totalPages])
  
  const prevPage = useCallback(() => {
    if (page > 1) {
      setPage(p => p - 1)
    }
  }, [page])
  
  const handleSetPageSize = useCallback((size: number) => {
    setPageSize(size)
    // Reset to page 1 when changing page size
    setPage(1)
  }, [])
  
  return {
    pageData,
    page,
    pageSize,
    totalPages,
    totalItems,
    goToPage,
    nextPage,
    prevPage,
    setPageSize: handleSetPageSize,
    startIndex: totalItems > 0 ? startIndex : 0,
    endIndex,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    pageSizeOptions
  }
}

/**
 * Hook for virtual scrolling with large lists
 * For even better performance with 1000+ items
 */
export function useVirtualScroll<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3
}: {
  items: T[]
  itemHeight: number
  containerHeight: number
  overscan?: number
}) {
  const [scrollTop, setScrollTop] = useState(0)
  
  const visibleCount = Math.ceil(containerHeight / itemHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(items.length, startIndex + visibleCount + 2 * overscan)
  
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, index) => ({
      item,
      index: startIndex + index,
      style: {
        position: 'absolute' as const,
        top: (startIndex + index) * itemHeight,
        height: itemHeight,
        left: 0,
        right: 0
      }
    }))
  }, [items, startIndex, endIndex, itemHeight])
  
  const totalHeight = items.length * itemHeight
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])
  
  return {
    visibleItems,
    totalHeight,
    handleScroll,
    containerStyle: {
      position: 'relative' as const,
      height: totalHeight,
      width: '100%'
    }
  }
}

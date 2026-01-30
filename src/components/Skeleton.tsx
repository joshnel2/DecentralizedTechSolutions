import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  className?: string
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({ 
  width, 
  height, 
  variant = 'text', 
  className = '',
  animation = 'pulse'
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  return (
    <div 
      className={`${styles.skeleton} ${styles[variant]} ${styles[animation]} ${className}`}
      style={style}
    />
  )
}

// Table skeleton
interface TableSkeletonProps {
  rows?: number
  columns?: number
  showHeader?: boolean
  className?: string
}

export function TableSkeleton({ 
  rows = 5, 
  columns = 5, 
  showHeader = true,
  className = '' 
}: TableSkeletonProps) {
  return (
    <div className={`${styles.tableSkeleton} ${className}`}>
      {showHeader && (
        <div className={styles.tableHeader}>
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} height={16} variant="rounded" />
          ))}
        </div>
      )}
      <div className={styles.tableBody}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className={styles.tableRow}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton 
                key={colIndex} 
                height={14} 
                width={colIndex === 0 ? '70%' : '50%'} 
                variant="rounded" 
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// List skeleton
interface ListSkeletonProps {
  rows?: number
  showAvatar?: boolean
  showSubtext?: boolean
  className?: string
}

export function ListSkeleton({ 
  rows = 5, 
  showAvatar = true, 
  showSubtext = true,
  className = '' 
}: ListSkeletonProps) {
  return (
    <div className={`${styles.listSkeleton} ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.listItem}>
          {showAvatar && (
            <Skeleton width={40} height={40} variant="circular" />
          )}
          <div className={styles.listContent}>
            <Skeleton height={16} width="60%" variant="rounded" />
            {showSubtext && (
              <Skeleton height={12} width="40%" variant="rounded" />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Card skeleton
interface CardSkeletonProps {
  showImage?: boolean
  lines?: number
  className?: string
}

export function CardSkeleton({ 
  showImage = true, 
  lines = 3,
  className = '' 
}: CardSkeletonProps) {
  return (
    <div className={`${styles.cardSkeleton} ${className}`}>
      {showImage && (
        <Skeleton height={160} variant="rectangular" />
      )}
      <div className={styles.cardContent}>
        <Skeleton height={20} width="80%" variant="rounded" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton 
            key={i} 
            height={14} 
            width={i === lines - 1 ? '60%' : '100%'} 
            variant="rounded" 
          />
        ))}
      </div>
    </div>
  )
}

// Grid skeleton for card layouts
interface GridSkeletonProps {
  cards?: number
  columns?: number
  className?: string
}

export function GridSkeleton({ 
  cards = 6, 
  columns = 3,
  className = '' 
}: GridSkeletonProps) {
  return (
    <div 
      className={`${styles.gridSkeleton} ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: cards }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

// Stats/Metric skeleton
export function StatsSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`${styles.statsSkeleton} ${className}`}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={styles.statCard}>
          <Skeleton height={14} width="50%" variant="rounded" />
          <Skeleton height={32} width="70%" variant="rounded" />
          <Skeleton height={12} width="40%" variant="rounded" />
        </div>
      ))}
    </div>
  )
}

export default Skeleton

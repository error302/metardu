'use client'

/**
 * VirtualList — Virtual scrolling for large lists
 *
 * Only renders visible items + a small buffer, instead of rendering
 * thousands of DOM nodes. Dramatically improves performance for:
 * - Beacon lists (1000+ beacons)
 * - Parcel attribute tables (500+ parcels)
 * - Activity feed (infinite scroll)
 * - F/R vault search results
 *
 * Usage:
 * <VirtualList
 *   items={parcels}
 *   itemHeight={48}
 *   height={400}
 *   renderItem={(parcel, index) => <ParcelRow parcel={parcel} />}
 * />
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  height: number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number  // extra items to render above/below visible area
  className?: string
  onEndReached?: () => void  // infinite scroll callback
  endReachedThreshold?: number  // pixels from bottom to trigger
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  overscan = 5,
  className = '',
  onEndReached,
  endReachedThreshold = 100,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate visible range
  const { startIndex, endIndex, totalHeight } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visibleCount = Math.ceil(height / itemHeight) + overscan * 2
    const endIndex = Math.min(items.length, startIndex + visibleCount)
    const totalHeight = items.length * itemHeight

    return { startIndex, endIndex, totalHeight }
  }, [scrollTop, itemHeight, height, items.length, overscan])

  // Throttled scroll handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    setScrollTop(target.scrollTop)

    // Check if near bottom for infinite scroll
    if (onEndReached) {
      const { scrollTop: st, scrollHeight, clientHeight } = target
      if (scrollHeight - st - clientHeight < endReachedThreshold) {
        onEndReached()
      }
    }
  }, [onEndReached, endReachedThreshold])

  // Visible items
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, i) => ({
      item,
      index: startIndex + i,
    }))
  }, [items, startIndex, endIndex])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-auto ${className}`}
      style={{ height, position: 'relative' }}
    >
      {/* Total height spacer */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible items */}
        <div
          style={{
            position: 'absolute',
            top: startIndex * itemHeight,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map(({ item, index }) => (
            <div
              key={`vlist-${index}`}
              style={{
                height: itemHeight,
                overflow: 'hidden',
              }}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * useInfiniteScroll — Hook for loading more data as user scrolls.
 *
 * @example
 * const { ref, isLoading, hasMore } = useInfiniteScroll({
 *   onLoadMore: () => fetchMoreData(),
 *   hasMore: currentPage < totalPages,
 * })
 */
export function useInfiniteScroll(options: {
  onLoadMore: () => void | Promise<void>
  hasMore: boolean
  threshold?: number
}) {
  const { onLoadMore, hasMore, threshold = 200 } = options
  const [isLoading, setIsLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || isLoading) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          setIsLoading(true)
          try {
            await onLoadMore()
          } finally {
            setIsLoading(false)
          }
        }
      },
      { rootMargin: `${threshold}px` }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onLoadMore, hasMore, isLoading, threshold])

  return { sentinelRef, isLoading, hasMore }
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-900 rounded-xl p-6 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-3/4 mb-3"/>
      <div className="h-3 bg-gray-800 rounded w-1/2 mb-2"/>
      <div className="h-3 bg-gray-800 rounded w-2/3"/>
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-gray-800 rounded mb-2"/>
      {[1,2,3,4,5].map(i => (
        <div key={i} className="h-8 bg-gray-900 rounded mb-1"/>
      ))}
    </div>
  )
}

export function SkeletonMap() {
  return (
    <div className="w-full h-96 bg-gray-900 rounded animate-pulse 
      flex items-center justify-center">
      <p className="text-gray-700">Loading map...</p>
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="animate-pulse space-y-3">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="h-16 bg-gray-900 rounded-lg"/>
      ))}
    </div>
  )
}

export function SkeletonInput() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-1/4 mb-2"/>
      <div className="h-10 bg-gray-800 rounded"/>
    </div>
  )
}

export function SkeletonButton() {
  return (
    <div className="h-10 bg-gray-700 rounded w-24 animate-pulse"/>
  )
}

// Content-shaped skeleton primitives for perceived-performance while data loads.
// Colors track the admin dark theme used across the app.

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/[0.06] ${className}`}
      aria-hidden="true"
    />
  );
}

// A grid of stat-card placeholders (e.g. dashboard / registrations headers).
export function SkeletonStatGrid({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="admin-card min-w-0 p-5 sm:p-6">
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

// A table placeholder with a header row and N body rows.
export function SkeletonTable({ rows = 8, columns = 5, className = '' }) {
  return (
    <div className={`admin-card overflow-hidden p-4 sm:p-6 ${className}`}>
      <div className="mb-4 flex gap-4 border-b border-white/10 pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 py-1">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={`h-4 flex-1 ${c === 0 ? 'max-w-[40%]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// A list of card placeholders (e.g. recent events / event grid).
export function SkeletonCardList({ count = 5, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="admin-card flex items-center gap-4 p-5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-2 h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

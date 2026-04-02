import { Skeleton } from "@/components/ui/skeleton"

export default function NursingLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <Skeleton className="h-24 w-full" />

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-md border p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="mb-3 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              <Skeleton className="h-16 md:col-span-2" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

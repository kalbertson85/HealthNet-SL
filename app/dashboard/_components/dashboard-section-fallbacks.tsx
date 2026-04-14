import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function MetricsFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}

export function AlertsFallback() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Skeleton key={idx} className="h-36 w-full" />
        ))}
      </div>
    </div>
  )
}

export function TrendsFallback({ showRevenueTrend }: { showRevenueTrend: boolean }) {
  const count = showRevenueTrend ? 3 : 2
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }).map((_, idx) => (
          <Skeleton key={idx} className="h-80 w-full" />
        ))}
      </div>
    </div>
  )
}

export function RecentActivityFallback() {
  return (
    <div className="order-1 md:order-2 grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recent Patients</CardTitle>
          <CardDescription>Loading newly registered patients...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Today’s Appointments</CardTitle>
          <CardDescription>Loading upcoming appointments...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-52" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

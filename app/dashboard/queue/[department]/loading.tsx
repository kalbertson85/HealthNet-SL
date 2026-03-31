import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 10 }).map((_, idx) => (
            <Skeleton key={idx} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

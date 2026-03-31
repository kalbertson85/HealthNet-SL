import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Bell, CheckCheck, Clock, AlertCircle, Calendar, FileText, Pill, CreditCard } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const typeIcons = {
  appointment: Calendar,
  lab_result: FileText,
  prescription: Pill,
  payment: CreditCard,
  system: AlertCircle,
}

const priorityColors = {
  low: "bg-slate-500",
  normal: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
}

async function markAsRead(notificationId: string) {
  "use server"
  const supabase = await createServerClient()

  await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
}

async function markAllAsRead() {
  "use server"
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_read", false)
}

export default async function NotificationsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch notifications
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0
  const unreadNotifications = notifications?.filter((n) => !n.is_read) || []
  const readNotifications = notifications?.filter((n) => n.is_read) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "All caught up!"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/notifications/settings">
            <Button variant="outline">Notification Settings</Button>
          </Link>
          {unreadCount > 0 && (
            <form action={markAllAsRead}>
              <Button type="submit">
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark All Read
              </Button>
            </form>
          )}
        </div>
      </div>

      <Tabs defaultValue="unread" className="space-y-4">
        <TabsList>
          <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
          <TabsTrigger value="all">All ({notifications?.length || 0})</TabsTrigger>
          <TabsTrigger value="read">Read ({readNotifications.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="unread" className="space-y-4">
          {unreadNotifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No unread notifications</p>
              </CardContent>
            </Card>
          ) : (
            unreadNotifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} />
            ))
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {notifications?.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}
        </TabsContent>

        <TabsContent value="read" className="space-y-4">
          {readNotifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No read notifications</p>
              </CardContent>
            </Card>
          ) : (
            readNotifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface NotificationItem {
  id: string
  title: string
  message: string
  type: keyof typeof typeIcons
  priority: keyof typeof priorityColors
  is_read: boolean
  created_at: string
}

function NotificationCard({ notification }: { notification: NotificationItem }) {
  const Icon = typeIcons[notification.type as keyof typeof typeIcons] || Bell
  const priorityColor = priorityColors[notification.priority as keyof typeof priorityColors] || priorityColors.normal

  return (
    <Card className={!notification.is_read ? "border-l-4 border-l-primary" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2 rounded-lg ${priorityColor}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-lg">{notification.title}</CardTitle>
                {!notification.is_read && <Badge variant="secondary">New</Badge>}
                <Badge variant="outline" className="text-xs">
                  {notification.type.replace("_", " ")}
                </Badge>
              </div>
              <CardDescription>{notification.message}</CardDescription>
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(notification.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          {!notification.is_read && (
            <form action={markAsRead.bind(null, notification.id)}>
              <Button type="submit" size="sm" variant="ghost">
                <CheckCheck className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </CardHeader>
    </Card>
  )
}

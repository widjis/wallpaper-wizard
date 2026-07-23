import { createFileRoute } from "@tanstack/react-router";
import { UserPlus, Search } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users — CWCM" },
      { name: "description", content: "Manage administrators, operators, and viewers of the campaign portal." },
      { property: "og:title", content: "Users — CWCM" },
      { property: "og:description", content: "Manage administrators, operators, and viewers of the campaign portal." },
    ],
  }),
  component: Page,
});

const users = [
  { name: "Widji", email: "widji@corp.intra.local", role: "Administrator", last: "23 Jul 2026 07:58", status: "Active" },
  { name: "Rian Pratama", email: "rian@corp.intra.local", role: "Operator", last: "22 Jul 2026 16:14", status: "Active" },
  { name: "Dewi Lestari", email: "dewi@corp.intra.local", role: "Operator", last: "21 Jul 2026 09:02", status: "Active" },
  { name: "Andi Kurniawan", email: "andi@corp.intra.local", role: "Viewer", last: "18 Jul 2026 11:23", status: "Active" },
  { name: "Sinta Ayu", email: "sinta@corp.intra.local", role: "Viewer", last: "—", status: "Disabled" },
];

function roleColor(r: string) {
  if (r === "Administrator") return "bg-primary-soft text-primary";
  if (r === "Operator") return "bg-info-soft text-info";
  return "bg-muted text-muted-foreground";
}

function Page() {
  return (
    <AppLayout title="Users" subtitle="Manage portal access and roles">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-9 bg-card" />
        </div>
        <div className="flex-1" />
        <Button><UserPlus className="h-4 w-4 mr-2" />Add user</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.email}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                      {u.name.charAt(0)}
                    </div>
                    <span className="font-medium">{u.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell><Badge className={`${roleColor(u.role)} hover:${roleColor(u.role)}`}>{u.role}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{u.last}</TableCell>
                <TableCell>
                  {u.status === "Active" ? (
                    <span className="inline-flex items-center gap-1.5 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-success" />Active</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />Disabled</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost">Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
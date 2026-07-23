import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { UserPlus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { isAdministrator } from "@/lib/roles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGet, apiPatch, apiPost, formatDateTime } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { UserMutationPayload, UserSummary } from "@cwcm/types";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users — CWCM" },
      {
        name: "description",
        content: "Manage administrators, operators, and viewers of the campaign portal.",
      },
      { property: "og:title", content: "Users — CWCM" },
      {
        property: "og:description",
        content: "Manage administrators, operators, and viewers of the campaign portal.",
      },
    ],
  }),
  component: Page,
});

function roleColor(r: string) {
  if (r === "Administrator") return "bg-primary-soft text-primary";
  if (r === "Operator") return "bg-info-soft text-info";
  return "bg-muted text-muted-foreground";
}

function Page() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [form, setForm] = useState<UserMutationPayload>({
    username: "",
    password: "",
    role: "OPERATOR",
    isActive: true,
  });
  const { data, isPending, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<{ items: UserSummary[] }>("/users"),
  });
  const canManage = isAdministrator(session?.user.role);

  const createMutation = useMutation({
    mutationFn: (payload: UserMutationPayload) =>
      apiPost<UserSummary>("/users", {
        ...payload,
        password: payload.password ?? "",
      }),
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User created");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create user");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UserMutationPayload) => {
      if (!editingUserId) {
        throw new Error("User ID is required");
      }
      return apiPatch<UserSummary>(`/users/${editingUserId}`, payload);
    },
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => apiDelete(`/users/${userId}`),
    onSuccess: () => {
      setDeleteUserId(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    },
  });

  const rows = useMemo(
    () =>
      data?.items.map((user) => ({
        id: user.id,
        name: user.username,
        role: user.role.charAt(0) + user.role.slice(1).toLowerCase(),
        roleValue: user.role,
        last: formatDateTime(user.lastLoginAt),
        status: user.isActive ? "Active" : "Disabled",
      })) ?? [],
    [data?.items],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((user) => {
        if (!search) return true;
        const keyword = search.toLowerCase();
        return (
          user.name.toLowerCase().includes(keyword) || user.role.toLowerCase().includes(keyword)
        );
      }),
    [rows, search],
  );

  function resetForm() {
    setShowForm(false);
    setEditingUserId(null);
    setForm({
      username: "",
      password: "",
      role: "OPERATOR",
      isActive: true,
    });
  }

  if (!canManage) {
    return (
      <AppLayout title="Users" subtitle="Manage portal access and roles">
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-sm text-muted-foreground">
          Your role does not have access to user administration.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Users" subtitle="Manage portal access and roles">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="pl-9 bg-card"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex-1" />
        {canManage ? (
          <Button
            onClick={() => {
              if (showForm && !editingUserId) {
                resetForm();
                return;
              }
              setShowForm(true);
              setEditingUserId(null);
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add user
          </Button>
        ) : null}
      </div>

      {showForm && canManage ? (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Username"
            value={form.username}
            onChange={(value) => setForm({ ...form, username: value })}
          />
          <Field
            label={editingUserId ? "New password (optional)" : "Password"}
            type="password"
            value={form.password ?? ""}
            onChange={(value) => setForm({ ...form, password: value })}
          />
          <div className="space-y-1.5">
            <Label>Role</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.role}
              onChange={(event) =>
                setForm({
                  ...form,
                  role: event.target.value as UserMutationPayload["role"],
                })
              }
            >
              <option value="ADMINISTRATOR">Administrator</option>
              <option value="OPERATOR">Operator</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.isActive ? "ACTIVE" : "DISABLED"}
              onChange={(event) =>
                setForm({
                  ...form,
                  isActive: event.target.value === "ACTIVE",
                })
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>
          <div className="md:col-span-2 flex gap-3">
            <Button
              onClick={() =>
                editingUserId ? updateMutation.mutate(form) : createMutation.mutate(form)
              }
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingUserId
                ? updateMutation.isPending
                  ? "Updating..."
                  : "Update user"
                : createMutation.isPending
                  ? "Creating..."
                  : "Create user"}
            </Button>
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-destructive">
                  {error instanceof Error ? error.message : "Failed to load users."}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {search ? "No users match the current search." : "No users available yet."}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                        {u.name.charAt(0)}
                      </div>
                      <span className="font-medium">{u.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${roleColor(u.role)} hover:${roleColor(u.role)}`}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.last}</TableCell>
                  <TableCell>
                    {u.status === "Active" ? (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        Disabled
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const live = data?.items?.find((item) => item.id === u.id);
                          if (!live) return;
                          setEditingUserId(live.id);
                          setShowForm(true);
                          setForm({
                            username: live.username,
                            password: "",
                            role: live.role,
                            isActive: live.isActive,
                          });
                        }}
                        disabled={!canManage}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteUserId(u.id)}
                        disabled={!canManage}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(deleteUserId)}
        onOpenChange={(open) => !open && setDeleteUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the selected portal user and revoke active sessions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleteUserId) {
                  deleteMutation.mutate(deleteUserId);
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

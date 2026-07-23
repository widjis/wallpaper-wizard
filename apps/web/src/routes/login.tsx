import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("Widji");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">CWCM Login</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in with your local CWCM account.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              await login(username, password);
              await navigate({ to: "/" });
            } catch (submissionError) {
              setError(submissionError instanceof Error ? submissionError.message : "Login failed");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          <Button className="w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}

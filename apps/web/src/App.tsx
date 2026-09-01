import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { api, type Session } from "@/lib/api";

export function App() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("owner@example.test");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.me().then(setSession).catch(() => undefined);
  }, []);

  async function doLogin() {
    setError(null);
    try {
      await api.login(email, password);
      setSession(await api.me());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-foreground">
      <div>
        <h1 className="text-3xl font-semibold text-brand">Forge auth demo</h1>
        <p className="mt-2 text-sm text-muted-foreground">API URL: {api.baseUrl}</p>
      </div>
      {session ? (
        <section className="rounded-lg border p-4">
          <p className="font-medium">Signed in as {session.email}</p>
          <p className="text-sm text-muted-foreground">Role: {session.role}</p>
        </section>
      ) : (
        <section className="grid gap-3 rounded-lg border p-4">
          <input className="rounded border p-2" placeholder="email or username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="rounded border p-2" placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button onClick={doLogin}>Log in</Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </section>
      )}
      <Button variant="outline" onClick={toggleTheme}>Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode</Button>
    </main>
  );
}

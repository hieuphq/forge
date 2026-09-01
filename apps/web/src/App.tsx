import { apiBaseUrl } from "@/lib/runtime-config";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { ExampleItemForm } from "@/modules/example";

export function App() {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-background py-10">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-brand">
          @yourorg/web
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          API URL: {apiBaseUrl}
        </p>
        <Button
          type="button"
          className="mt-4"
          data-testid="theme-toggle"
          onClick={toggleTheme}
        >
          Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
        </Button>
      </div>
      <ExampleItemForm />
    </main>
  );
}

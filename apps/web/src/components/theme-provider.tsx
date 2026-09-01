import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Resolves a stored/selected `Theme` down to the concrete "light" | "dark"
 * that gets applied to the DOM. "system" defers to the OS preference at the
 * moment of resolution (it is NOT re-resolved reactively if the OS setting
 * changes while the tab is open — good enough for this app; a
 * matchMedia listener could be added later if that's ever needed).
 */
function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

/** Reads the persisted theme preference, defaulting to "system" when unset
 * or when localStorage is unavailable (e.g. SSR, privacy mode). */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage can throw (privacy mode, disabled storage). Fall through
    // to the default rather than crashing theme init.
  }
  return "system";
}

/** Applies the resolved theme to the document root by toggling the `.dark`
 * class that `@custom-variant dark (&:where(.dark, .dark *));` in
 * src/index.css keys off of (Tailwind v4 CSS-first dark mode). */
function applyThemeClass(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

interface ThemeContextValue {
  /** The raw preference: "light" | "dark" | "system". */
  theme: Theme;
  /** The concrete theme actually applied to the DOM. */
  resolvedTheme: ResolvedTheme;
  /** Sets an explicit theme preference and persists it. */
  setTheme: (theme: Theme) => void;
  /** Toggles between light and dark (collapsing "system" to its resolved
   * value first, then flipping it). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  // Apply on mount and on every change, so a reload re-applies the
  // persisted class before/at first paint of this component.
  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort persistence; theme still applies for this session.
    }
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolveTheme(theme) === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

// Exported for a logic-level unit test (no DOM/localStorage available in
// that harness) that exercises the read/resolve logic without mounting React.
export const __internal = { readStoredTheme, resolveTheme, applyThemeClass, STORAGE_KEY };

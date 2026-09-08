export type Theme = "light" | "dark";

const KEY = "officechat.theme";

function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const theme = $state<{ value: Theme }>({ value: initialTheme() });

export function applyTheme(): void {
  document.documentElement.dataset.theme = theme.value;
}

export function toggleTheme(): void {
  theme.value = theme.value === "dark" ? "light" : "dark";
  localStorage.setItem(KEY, theme.value);
  applyTheme();
}

try {
  const mode = localStorage.getItem("miks.themeMode") === "light" ? "light" : "dark";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.effectiveMode = mode;
  document.documentElement.style.colorScheme = mode;
} catch {}
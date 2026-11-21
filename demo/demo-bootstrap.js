(() => {
  "use strict";

  // Read initial theme from ?theme=light|dark so the embedded preview opens
  // in the same color scheme as the host landing page, while keeping its own
  // theme storage completely isolated from both the host site and localhost:8000.
  const params = new URLSearchParams(window.location.search || "");
  const requestedTheme = params.get("theme");
  const initialTheme =
    requestedTheme === "light" || requestedTheme === "dark" ? requestedTheme : "auto";

  function createMemoryStorage(initialEntries) {
    const store = new Map(Object.entries(initialEntries || {}));
    return {
      get length() {
        return store.size;
      },
      key(index) {
        const keys = Array.from(store.keys());
        return index >= 0 && index < keys.length ? keys[index] : null;
      },
      getItem(k) {
        const key = String(k);
        return store.has(key) ? store.get(key) : null;
      },
      setItem(k, v) {
        store.set(String(k), String(v));
      },
      removeItem(k) {
        store.delete(String(k));
      },
      clear() {
        store.clear();
      },
    };
  }

  const initialLocal = initialTheme === "auto" ? {} : { dv_theme_mode: initialTheme };
  const memLocal = createMemoryStorage(initialLocal);
  const memSession = createMemoryStorage({ dv_active_tab: "vault" });

  try {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        return memLocal;
      },
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        return memSession;
      },
    });
  } catch {
    // Fallback: if browser locks Storage descriptors, pre-set document theme dataset
    if (initialTheme === "light" || initialTheme === "dark") {
      document.documentElement.dataset.themeMode = initialTheme;
      document.documentElement.dataset.theme = initialTheme;
      document.documentElement.style.colorScheme = initialTheme;
    }
  }
})();

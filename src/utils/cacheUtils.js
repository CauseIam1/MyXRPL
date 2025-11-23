export const CACHE_KEY_PREFIX = "xrpl_tx_cache_";
export const getLocalStorageUsage = () => {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const item = localStorage.getItem(key);
      total += key.length + item.length;
    }
    const usagePercent = (total / (5 * 1024 * 1024)) * 100; // 5MB limit
    return { total, usagePercent };
  } catch (e) {
    return { total: 0, usagePercent: 0 };
  }
};

export const isQuotaExceededError = (err) => {
  return (
    err instanceof DOMException &&
    (err.code === 22 ||
      err.code === 1014 ||
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
};

export const cleanupOldCache = () => {
  try {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith(CACHE_KEY_PREFIX) || key.startsWith("chart_"))
      ) {
        try {
          const item = localStorage.getItem(key);
          const data = JSON.parse(item);
          if (data.expires && data.expires < now) {
            localStorage.removeItem(key);
          } else if (data.timestamp && data.timestamp < oneDayAgo) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (e) {
    console.warn("Cache cleanup failed:", e);
  }
};

export const cleanupCacheAggressively = () => {
  try {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000; // Keep only 6 hours
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith(CACHE_KEY_PREFIX) ||
          key.startsWith("chart_") ||
          key.startsWith("swap_groups_"))
      ) {
        try {
          const cachedData = JSON.parse(localStorage.getItem(key));
          if (cachedData.timestamp < sixHoursAgo) {
            keysToRemove.push(key);
          }
        } catch (parseError) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));

    if (keysToRemove.length === 0) {
      const cacheItems = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith(CACHE_KEY_PREFIX) ||
            key.startsWith("chart_") ||
            key.startsWith("swap_groups_"))
        ) {
          try {
            const item = localStorage.getItem(key);
            cacheItems.push({ key, size: item.length });
          } catch (e) {}
        }
      }
      cacheItems
        .sort((a, b) => b.size - a.size)
        .slice(0, Math.ceil(cacheItems.length * 0.5))
        .forEach((item) => localStorage.removeItem(item.key));
    }
  } catch (error) {
    console.warn("Cache cleanup error:", error);
  }
};

export const hexToRgb = (hex) => {
  if (!hex) return "0, 0, 0";
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

export const cleanupOldCache = () => {
  try {
    const now = Date.now();
    const cacheEntries = [];
    let totalSize = 0;

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("chart_data_cache_")) {
        try {
          const item = localStorage.getItem(key);
          const data = JSON.parse(item);
          cacheEntries.push({
            key,
            expires: data.expires || now + 86400000, // Default 24h
            size: item.length,
            timestamp: data.timestamp || now,
          });
          totalSize += item.length;
        } catch (e) {
          // Mark invalid entries for removal
          cacheEntries.push({ key, expires: 0, size: 0, timestamp: 0 });
        }
      }
    });

    const expiredEntries = cacheEntries.filter((entry) => entry.expires < now);
    expiredEntries.forEach((entry) => localStorage.removeItem(entry.key));

    const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB
    if (totalSize > MAX_CACHE_SIZE) {
      cacheEntries
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, Math.floor(cacheEntries.length * 0.3))
        .forEach((entry) => localStorage.removeItem(entry.key));
    }

    const MAX_CACHE_ENTRIES = 100;
    if (cacheEntries.length > MAX_CACHE_ENTRIES) {
      cacheEntries
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, cacheEntries.length - MAX_CACHE_ENTRIES)
        .forEach((entry) => localStorage.removeItem(entry.key));
    }
  } catch (e) {}
};

export const formatCurrencyCode = (code) => {
  if (code === "XRP") return "XRP";
  if (code && typeof code === "string" && code.length === 40) {
    try {
      let ascii = "";
      for (let i = 0; i < code.length; i += 2) {
        const hexPair = code.substr(i, 2);
        const charCode = parseInt(hexPair, 16);
        if (charCode !== 0 && charCode >= 32 && charCode <= 126) {
          ascii += String.fromCharCode(charCode);
        }
      }
      if (ascii.length > 0 && ascii.length <= 20) {
        return ascii;
      }
    } catch (e) {}
  }
  if (code && code.length > 12) return code.substring(0, 12) + "...";
  return code || "Unknown";
};

export const formatYAxisTick = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "0";
  }

  if (value === 0 || Math.abs(value) < 1e-15) {
    return "0";
  }

  let decimals;
  if (value >= 1) {
    decimals = 4;
  } else if (value >= 0.1) {
    decimals = 6;
  } else if (value >= 0.001) {
    decimals = 8;
  } else {
    decimals = Math.max(12, Math.ceil(Math.abs(Math.log10(value))) + 2);
    decimals = Math.min(decimals, 15);
  }

  const formatted = value.toFixed(decimals);
  return formatted.replace(/\.?0+$/, "");
};

export const formatPrice = (num) => {
  if (num === null || num === undefined || isNaN(num)) return "0.00";

  if (num > 0 && num < 0.000001) {
    return num.toExponential(2);
  }

  if (num >= 1) {
    return parseFloat(num)
      .toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      .replace(/\.?0+$/, "");
  }

  return parseFloat(num)
    .toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })
    .replace(/\.?0+$/, "");
};

export const formatNumber = (num, decimals = 4) => {
  if (num === null || num === undefined || isNaN(num)) return "0.00";

  if (num > 0 && num < 0.000001) {
    return num.toExponential(6);
  }

  if (num > 0 && num < 0.001) {
    return formatYAxisTick(num);
  }

  const formatted = parseFloat(num).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return formatted.replace(/\.?0+$/, "");
};

export const asciiToHex = (ascii) => {
  if (!ascii || ascii === "XRP") return ascii;
  if (ascii.length === 40 && /^[0-9A-F]+$/i.test(ascii)) {
    return ascii.toUpperCase();
  }
  if (ascii.length === 3 && /^[A-Z0-9]{3}$/.test(ascii)) {
    return ascii;
  }
  try {
    let hex = "";
    for (let i = 0; i < ascii.length; i++) {
      hex += ascii.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0");
    }
    return hex.padEnd(40, "0");
  } catch (e) {
    return ascii;
  }
};

export const determineBaseCurrency = (pair, tokenPrices) => {
  const priceKey1 = `${pair.currency1}-${pair.issuer1}`;
  const priceKey2 = `${pair.currency2}-${pair.issuer2}`;
  const currentPrice1 = tokenPrices[priceKey1];
  const currentPrice2 = tokenPrices[priceKey2];

  if (currentPrice1 && currentPrice2) {
    return currentPrice1 >= currentPrice2;
  } else if (currentPrice1) {
    return true;
  } else if (currentPrice2) {
    return false;
  }
  return true;
};

export const generateNormalizedPairKey = (
  currency1,
  issuer1,
  currency2,
  issuer2
) => {
  const pair1 = `${currency1}-${issuer1}`;
  const pair2 = `${currency2}-${issuer2}`;
  const sortedPairs = [pair1, pair2].sort();
  return `${sortedPairs[0]}→${sortedPairs[1]}`;
};

export const isValidXrpAddress = (address) => {
  if (!address) return false;
  return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
};

export const isValidCurrencyCode = (code) => {
  if (!code) return false;
  if (code === "XRP") return true;
  if (code.length === 3 && /^[A-Z0-9]{3}$/.test(code)) return true;
  if (code.length === 40 && /^[0-9A-F]{40}$/.test(code)) return true;
  return false;
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

export const formatLargeNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return "0";

  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(2) + "B";
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + "K";
  }
  return formatNumber(num, 2);
};

export const getTimeAgo = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
};

export const isValidChartDataPoint = (dataPoint, isPairChart) => {
  if (!dataPoint || !dataPoint.timestamp) return false;

  const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
  const volumeKey = isPairChart ? "volume" : "assetVolume";

  return (
    dataPoint[priceKey] > 0 &&
    isFinite(dataPoint[priceKey]) &&
    dataPoint[volumeKey] >= 0
  );
};

export const sampleData = (data, maxPoints = 1000) => {
  if (data.length <= maxPoints) return data;

  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
};

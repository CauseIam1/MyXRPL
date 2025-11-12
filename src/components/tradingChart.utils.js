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
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("chart_data_cache_")) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data.expires < now) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      }
    });
  } catch (e) {
    console.warn("Cache cleanup failed:", e);
  }
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

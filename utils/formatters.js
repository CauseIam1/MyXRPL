// Simple currency mappings - no auto-lookup
const currencyMappings = {
  "245452554D500000000000000000000000000000": "$Trump",
  "4D454C414E494100000000000000000000000000": "Melania",
  "424152524F4E5452554D50000000000000000000": "BARRONTRUMP",
  "4245415200000000000000000000000000000000": "BEAR",
  404: "404",
  "414C4C494E000000000000000000000000000000": "ALLIN",
  "4C55584552500000000000000000000000000000": "LUXERP",
  "4C45444745520000000000000000000000000000": "LEDGER",
  "24414C4558000000000000000000000000000000": "$ALEX",
  // Add more as you discover them
};

// Format currency code - SIMPLE VERSION
export const formatCurrencyCode = (code) => {
  if (currencyMappings[code]) return currencyMappings[code];
  if (code === "XRP") return "XRP";
  if (code && code.length > 12) return code.substring(0, 12) + "...";
  return code || "Unknown";
};

// Format value with commas
export const formatValueWithCommas = (value) => {
  if (
    value === null ||
    value === undefined ||
    isNaN(value) ||
    !isFinite(value)
  ) {
    return "0.00";
  }
  return parseFloat(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Truncate long addresses
export const truncateAddress = (address) => {
  if (!address) return "Unknown";
  if (address.length > 20) {
    return (
      address.substring(0, 10) + "..." + address.substring(address.length - 7)
    );
  }
  return address;
};

// Create unique pair key - Handle XRP properly (no issuer)
export const getPairKey = (asset1, asset2) => {
  // Handle XRP case properly - XRP has no issuer
  const asset1Issuer = asset1.currency === "XRP" ? null : asset1.issuer;
  const asset2Issuer = asset2.currency === "XRP" ? null : asset2.issuer;

  // Create sorted assets for consistent key generation
  const assets = [
    { currency: asset1.currency, issuer: asset1Issuer },
    { currency: asset2.currency, issuer: asset2Issuer },
  ].sort((a, b) => {
    // Sort by currency first, then by issuer (null issuers first for XRP)
    const currencyCompare = a.currency.localeCompare(b.currency);
    if (currencyCompare !== 0) return currencyCompare;

    // Handle null issuers (XRP case)
    if (a.issuer === null && b.issuer === null) return 0;
    if (a.issuer === null) return -1;
    if (b.issuer === null) return 1;

    return (a.issuer || "").localeCompare(b.issuer || "");
  });

  // Generate key with proper null handling
  const issuer1 = assets[0].issuer ? assets[0].issuer : "XRP";
  const issuer2 = assets[1].issuer ? assets[1].issuer : "XRP";

  return `${assets[0].currency}-${issuer1}→${assets[1].currency}-${issuer2}`;
};

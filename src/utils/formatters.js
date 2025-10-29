// Format currency code - HEX to ASCII VERSION
export const formatCurrencyCode = (code) => {
  // Handle XRP special case
  if (code === "XRP") return "XRP";

  // Try to convert hex to ASCII for standard tokens
  if (code && typeof code === "string" && code.length === 40) {
    // Standard XRPL hex currency code length
    try {
      // Convert hex to ASCII, removing trailing nulls
      let ascii = "";
      for (let i = 0; i < code.length; i += 2) {
        const hexPair = code.substr(i, 2);
        const charCode = parseInt(hexPair, 16);
        if (charCode !== 0) {
          // Skip null bytes
          ascii += String.fromCharCode(charCode);
        }
      }
      // Only return if we got a reasonable result
      if (ascii.length > 0 && ascii.length <= 20) {
        return ascii;
      }
    } catch (e) {
      // Fall through to default handling
    }
  }

  // Fallback: truncate long codes
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

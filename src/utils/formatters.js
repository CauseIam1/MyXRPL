export const formatCurrencyCode = (code) => {
  if (code === "XRP") return "XRP";
  if (code && typeof code === "string" && code.length === 40) {
    try {
      let ascii = "";
      for (let i = 0; i < code.length; i += 2) {
        const hexPair = code.substr(i, 2);
        const charCode = parseInt(hexPair, 16);
        if (charCode !== 0) {
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

export const truncateAddress = (address) => {
  if (!address) return "Unknown";
  if (address.length > 20) {
    return (
      address.substring(0, 10) + "..." + address.substring(address.length - 7)
    );
  }
  return address;
};

export const getPairKey = (asset1, asset2) => {
  const asset1Issuer = asset1.currency === "XRP" ? null : asset1.issuer;
  const asset2Issuer = asset2.currency === "XRP" ? null : asset2.issuer;
  const assets = [
    { currency: asset1.currency, issuer: asset1Issuer },
    { currency: asset2.currency, issuer: asset2Issuer },
  ].sort((a, b) => {
    const currencyCompare = a.currency.localeCompare(b.currency);
    if (currencyCompare !== 0) return currencyCompare;
    if (a.issuer === null && b.issuer === null) return 0;
    if (a.issuer === null) return -1;
    if (b.issuer === null) return 1;
    return (a.issuer || "").localeCompare(b.issuer || "");
  });
  const issuer1 = assets[0].issuer ? assets[0].issuer : "XRP";
  const issuer2 = assets[1].issuer ? assets[1].issuer : "XRP";
  return `${assets[0].currency}-${issuer1}→${assets[1].currency}-${issuer2}`;
};

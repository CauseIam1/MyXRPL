// src/components/TokenPositions.jsx
import React, { useState, useEffect } from "react";

const formatCurrencyCode = (code) => {
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

const formatValueWithCommas = (value) => {
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

const TokenPositions = ({
  allTokens,
  tokenPrices,
  theme,
  themes,
  fontFamily,
  fonts,
  onTokenSelect,
}) => {
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(null);
  const [localTokenPrices, setLocalTokenPrices] = useState({});

  const formatXrpPrice = (price) => {
    if (price === null || price === undefined || isNaN(price)) {
      return "0.00";
    }
    if (price === 0) {
      return "0.00000000";
    }

    // Enhanced precision - show more decimal places for small numbers
    if (price < 0.000000001) {
      return price.toFixed(12); // For extremely small numbers
    } else if (price < 0.00000001) {
      return price.toFixed(11);
    } else if (price < 0.0000001) {
      return price.toFixed(10);
    } else if (price < 0.000001) {
      return price.toFixed(9);
    } else if (price < 0.00001) {
      return price.toFixed(8); // Show 8 decimal places
    } else if (price < 0.0001) {
      return price.toFixed(7);
    } else if (price < 0.001) {
      return price.toFixed(6); // Show 6 decimal places
    } else if (price < 0.01) {
      return price.toFixed(5);
    } else if (price < 0.1) {
      return price.toFixed(4);
    } else {
      return price.toFixed(3);
    }
  };

  const formatXrpAmount = (amount) => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return "0.00";
    }
    return parseFloat(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  useEffect(() => {
    if (tokenPrices && Object.keys(tokenPrices).length > 0) {
      setLocalTokenPrices(tokenPrices);
    }
  }, [tokenPrices]);

  useEffect(() => {
    if (allTokens.length > 0 && selectedTokenIndex === null) {
      setSelectedTokenIndex(0);
      if (onTokenSelect) {
        setTimeout(() => {
          onTokenSelect(allTokens[0]);
        }, 50);
      }
    }
  }, [allTokens, selectedTokenIndex, onTokenSelect]);

  const hexToRgb = (hex) => {
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

  const handleTokenClick = (token, index) => {
    setSelectedTokenIndex(index);
    if (onTokenSelect) {
      const chartToken = {
        currency: token.currency,
        issuer: token.issuer,
        originalCurrency: token.originalCurrency,
      };
      onTokenSelect(chartToken);
    }
  };

  const getTokenPriceDisplay = (token) => {
    if (token.currency === "XRP") {
      return "";
    }
    const priceKeys = [
      `${token.currency}-${token.issuer}`,
      `${token.originalCurrency || token.currency}-${token.issuer}`,
    ];
    let price = null;
    let priceKeyUsed = "";
    for (const priceKey of priceKeys) {
      if (localTokenPrices[priceKey] !== undefined) {
        price = localTokenPrices[priceKey];
        priceKeyUsed = priceKey;
        break;
      }
    }
    if (price === null && tokenPrices) {
      for (const priceKey of priceKeys) {
        if (tokenPrices[priceKey] !== undefined) {
          price = tokenPrices[priceKey];
          priceKeyUsed = priceKey;
          break;
        }
      }
    }
    if (price === undefined) {
      return " (Loading...)";
    } else if (price === "loading") {
      return " (Loading...)";
    } else if (
      price === null ||
      (typeof price === "number" && (isNaN(price) || price <= 0))
    ) {
      return token.issuer ? " (No AMM)" : " (No Issuer)";
    } else if (typeof price === "number" && price > 0) {
      return ` (${formatXrpPrice(price)} XRP)`;
    } else {
      return " (No AMM)";
    }
  };

  const getTokenXrpValue = (token) => {
    if (token.currency === "XRP") {
      return formatXrpAmount(Math.abs(token.totalNetAmount));
    }
    const priceKeys = [
      `${token.currency}-${token.issuer}`,
      `${token.originalCurrency || token.currency}-${token.issuer}`,
    ];
    let price = null;
    for (const priceKey of priceKeys) {
      if (localTokenPrices[priceKey] !== undefined) {
        price = localTokenPrices[priceKey];
        break;
      }
    }
    if (price === null && tokenPrices) {
      for (const priceKey of priceKeys) {
        if (tokenPrices[priceKey] !== undefined) {
          price = tokenPrices[priceKey];
          break;
        }
      }
    }
    if (price === undefined || price === "loading") {
      return "Loading...";
    } else if (
      price === null ||
      (typeof price === "number" && (isNaN(price) || price <= 0))
    ) {
      return "N/A";
    } else if (typeof price === "number" && price > 0) {
      const value = Math.abs(token.totalNetAmount) * price;
      return formatXrpAmount(value);
    } else {
      return "N/A";
    }
  };

  return (
    <div
      style={{
        background: themes[theme].cardBackground,
        borderRadius: "15px",
        padding: "15px",
        border: `2px solid ${themes[theme].border}`,
        height: "100%",
        boxShadow: `0 4px 15px rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: fonts[fontFamily],
      }}
    >
      <h3
        style={{
          fontSize: "1.5rem",
          fontWeight: "bold",
          color: themes[theme].primary,
          textAlign: "center",
          marginBottom: "10px",
          fontFamily: fonts[fontFamily],
        }}
      >
        📊 Token Positions
      </h3>
      <div
        style={{
          textAlign: "center",
          fontSize: "0.8rem",
          color: themes[theme].textSecondary,
          width: "100%",
          flexGrow: 1,
          overflowY: "auto",
          paddingRight: "10px",
        }}
      >
        {allTokens.length > 0 ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: "bold",
                padding: "6px 0",
                borderBottom: `1px solid ${themes[theme].border}`,
                color: themes[theme].secondary,
                fontFamily: fonts[fontFamily],
                fontSize: "0.85rem",
              }}
            >
              <div style={{ flex: "1", textAlign: "left" }}>Asset</div>
              <div style={{ flex: "1", textAlign: "center" }}>Amount</div>
              <div style={{ flex: "1", textAlign: "right" }}>Value (XRP)</div>
            </div>
            {allTokens.map((token, index) => {
              const priceDisplay = getTokenPriceDisplay(token);
              const xrpValue = getTokenXrpValue(token);
              return (
                <div
                  key={index}
                  onClick={() => handleTokenClick(token, index)}
                  style={{
                    padding: "5px 0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    backgroundColor:
                      selectedTokenIndex === index
                        ? `rgba(${hexToRgb(themes[theme].primary)}, 0.15)`
                        : "transparent",
                    borderRadius: "4px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "500",
                      color: themes[theme].secondary,
                      textAlign: "left",
                      flex: "1",
                      fontFamily: fonts[fontFamily],
                      fontSize: "0.85rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{formatCurrencyCode(token.currency)}</span>
                      {token.currency !== "XRP" && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: themes[theme].textSecondary,
                            marginLeft: "5px",
                            fontWeight: "normal",
                            fontFamily: fonts[fontFamily],
                          }}
                        >
                          {priceDisplay}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      color: token.isDeficit ? "#f87171" : "#4ade80",
                      textAlign: "center",
                      flex: "1",
                      fontWeight: "500",
                      fontFamily: fonts[fontFamily],
                      fontSize: "0.85rem",
                    }}
                  >
                    {formatValueWithCommas(Math.abs(token.totalNetAmount))}
                  </div>
                  <div
                    style={{
                      color: themes[theme].text,
                      textAlign: "right",
                      flex: "1",
                      fontWeight: "500",
                      fontFamily: fonts[fontFamily],
                      fontSize: "0.85rem",
                    }}
                  >
                    {xrpValue}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              color: themes[theme].textSecondary,
              fontStyle: "italic",
              padding: "25px 0",
              fontFamily: fonts[fontFamily],
              fontSize: "0.85rem",
            }}
          >
            No token positions found
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenPositions;

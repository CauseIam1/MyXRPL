import React, { useState, useEffect, useCallback } from "react";
import useInterval from "../hooks/useInterval";

const TokenPositions = ({
  allTokens,
  fetchTokenXrpPrice,
  formatValueWithCommas,
  formatCurrencyCode,
  theme,
  themes,
  fontFamily,
  fonts,
  visiblePairsCount, // New prop for pair count
}) => {
  const [tokenPrices, setTokenPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const formatXrpPrice = (price) => {
    if (price === null || price === undefined || isNaN(price)) {
      return "0.00";
    }
    if (price === 0) {
      return "0.00000000";
    }
    if (price < 0.00000001) {
      return price.toExponential(2);
    } else if (price < 0.0000001) {
      return price.toLocaleString("en-US", {
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      });
    } else if (price < 0.0000001) {
      return price.toLocaleString("en-US", {
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      });
    } else if (price < 0.001) {
      return price.toLocaleString("en-US", {
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      });
    } else if (price < 0.01) {
      return price.toLocaleString("en-US", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });
    } else {
      return price.toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      });
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

  const fetchAllTokenPrices = useCallback(async () => {
    if (allTokens.length === 0) return;
    setLoading(true);
    const updatedPrices = { ...tokenPrices };
    allTokens.forEach((token) => {
      if (token.currency !== "XRP") {
        const key = `${token.currency}-${token.issuer}`;
        if (updatedPrices[key] === undefined) {
          updatedPrices[key] = "loading";
        }
      }
    });
    setTokenPrices({ ...updatedPrices });
    for (const token of allTokens) {
      if (token.currency === "XRP") continue;
      const key = `${token.currency}-${token.issuer}`;
      try {
        const result = await fetchTokenXrpPrice(
          token.originalCurrency || token.currency,
          token.issuer
        );
        updatedPrices[key] = result;
      } catch (error) {
        console.error(`Error fetching price for ${token.currency}:`, error);
        updatedPrices[key] = null;
      }
      setTokenPrices({ ...updatedPrices });
    }
    setLoading(false);
  }, [allTokens, fetchTokenXrpPrice, tokenPrices]);

  useEffect(() => {
    if (allTokens.length > 0 && Object.keys(tokenPrices).length === 0) {
      const hasTokensToPrice = allTokens.some(
        (token) => token.currency !== "XRP"
      );
      if (hasTokensToPrice) {
        fetchAllTokenPrices();
      }
    }
  }, [allTokens, tokenPrices, fetchAllTokenPrices]);

  useInterval(() => {
    if (allTokens.length > 0) {
      fetchAllTokenPrices();
    }
  }, 180000);

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
          fontSize: "2rem",
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
          paddingRight: "15px",
        }}
      >
        {allTokens.length > 0 ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: "bold",
                padding: "4px 0",
                borderBottom: `1px solid ${themes[theme].border}`,
                color: themes[theme].secondary,
                fontFamily: fonts[fontFamily],
              }}
            >
              <div style={{ flex: "1", textAlign: "left" }}>Asset</div>
              <div style={{ flex: "1", textAlign: "center" }}>Amount</div>
              <div style={{ flex: "1", textAlign: "right" }}>Value (XRP)</div>
            </div>
            {allTokens.map((token, index) => {
              const priceKey = `${token.currency}-${token.issuer}`;
              const price = tokenPrices[priceKey];
              let priceDisplay = "";
              let xrpValue = "0.00";
              if (token.currency !== "XRP") {
                if (price === undefined) {
                  priceDisplay = " (Loading...)";
                  xrpValue = "Loading...";
                } else if (price === "loading") {
                  priceDisplay = " (Loading...)";
                  xrpValue = "Loading...";
                } else if (
                  price === null ||
                  (typeof price === "number" && isNaN(price))
                ) {
                  priceDisplay = token.issuer ? " (No AMM)" : " (No Issuer)";
                  xrpValue = "N/A";
                } else if (typeof price === "number" && price > 0) {
                  priceDisplay = ` (${formatXrpPrice(price)} XRP)`;
                  const value = Math.abs(token.totalNetAmount) * price;
                  xrpValue = formatXrpAmount(value);
                } else {
                  priceDisplay = " (No AMM)";
                  xrpValue = "N/A";
                }
              } else {
                xrpValue = formatXrpAmount(Math.abs(token.totalNetAmount));
              }
              return (
                <div
                  key={index}
                  style={{
                    marginBottom: "6px",
                    padding: "4px 0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      color: themes[theme].secondary,
                      textAlign: "left",
                      flex: "1",
                      fontFamily: fonts[fontFamily],
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
                            marginLeft: "6px",
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
                    }}
                  >
                    {token.formattedAmount}
                  </div>
                  <div
                    style={{
                      color: themes[theme].text,
                      textAlign: "right",
                      flex: "1",
                      fontWeight: "500",
                      fontFamily: fonts[fontFamily],
                    }}
                  >
                    {xrpValue}
                  </div>
                </div>
              );
            })}
            <div
              style={{
                borderTop: `1px solid ${themes[theme].border}`,
                marginTop: "8px",
                paddingTop: "8px",
                fontWeight: "bold",
                fontSize: "0.85rem",
              }}
            ></div>
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              color: themes[theme].textSecondary,
              fontStyle: "italic",
              padding: "20px 0",
              fontFamily: fonts[fontFamily],
            }}
          >
            No token positions found
          </div>
        )}
      </div>

      {visiblePairsCount !== undefined && (
        <div
          style={{
            textAlign: "center",
            padding: "8px 0 0 0",
            color: themes[theme].textSecondary,
            fontSize: "1.25rem",
            borderTop: `1px solid ${themes[theme].border}`,
            marginTop: "8px",
            fontFamily: fonts[fontFamily],
          }}
        >
          Number of Active Trading Pairs: {visiblePairsCount}
        </div>
      )}
    </div>
  );
};

export default TokenPositions;

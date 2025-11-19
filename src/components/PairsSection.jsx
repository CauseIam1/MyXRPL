import React, { useState, useEffect } from "react";

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

const PairsSection = ({
  group,
  setHiddenPairs,
  getPairKey,
  formatCurrencyCode,
  formatValueWithCommas,
  truncateAddress,
  fetchComprehensiveTokenData,
  theme,
  themes,
  fontFamily,
  fonts,
  tokenPrices,
  calculateReverseLatestPosition,
  onTokenClick,
}) => {
  const [showTokenDetails, setShowTokenDetails] = useState({
    asset1: false,
    asset2: false,
  });
  const [showSwapList, setShowSwapList] = useState(false);

  const calculateLatestPosition = () => {
    if (group.swaps.length === 0) return null;
    const latestSwap = group.swaps[0];
    const isLatestDirectionAsset1ToAsset2 =
      latestSwap.c1 === group.asset1.currency &&
      latestSwap.i1 === group.asset1.issuer;
    let totalAsset1 = 0;
    let totalAsset2 = 0;
    for (let i = 0; i < group.swaps.length; i++) {
      const swap = group.swaps[i];
      const isSwapDirectionAsset1ToAsset2 =
        swap.c1 === group.asset1.currency && swap.i1 === group.asset1.issuer;
      if (isSwapDirectionAsset1ToAsset2 !== isLatestDirectionAsset1ToAsset2) {
        break;
      }
      if (isLatestDirectionAsset1ToAsset2) {
        totalAsset1 += swap.v1;
        totalAsset2 += swap.v2;
      } else {
        totalAsset2 += swap.v1;
        totalAsset1 += swap.v2;
      }
    }
    return {
      asset1Amount: totalAsset1,
      asset2Amount: totalAsset2,
      direction: isLatestDirectionAsset1ToAsset2,
    };
  };

  const currentPosition = calculateLatestPosition();

  const positionAsSwap = currentPosition
    ? {
        c1: currentPosition.direction
          ? group.asset1.currency
          : group.asset2.currency,
        i1: currentPosition.direction
          ? group.asset1.issuer
          : group.asset2.issuer,
        v1: currentPosition.direction
          ? currentPosition.asset1Amount
          : currentPosition.asset2Amount,
        c2: currentPosition.direction
          ? group.asset2.currency
          : group.asset1.currency,
        i2: currentPosition.direction
          ? group.asset2.issuer
          : group.asset1.issuer,
        v2: currentPosition.direction
          ? currentPosition.asset2Amount
          : currentPosition.asset1Amount,
        date: group.swaps[0]?.date || new Date().toISOString(),
      }
    : null;

  const livePriceReverseQuote = positionAsSwap
    ? calculateReverseLatestPosition(positionAsSwap, tokenPrices)
    : null;

  const as1 = formatCurrencyCode(group.asset1.currency);
  const as2 = formatCurrencyCode(group.asset2.currency);
  const truncatedI1 = truncateAddress(group.asset1.issuer);
  const truncatedI2 = truncateAddress(group.asset2.issuer);
  const pairKey = getPairKey(group.asset1, group.asset2);
  let hasAsset1ToAsset2 = false;
  let hasAsset2ToAsset1 = false;
  group.swaps.forEach((swap) => {
    if (swap.c1 === group.asset1.currency && swap.i1 === group.asset1.issuer) {
      hasAsset1ToAsset2 = true;
    } else {
      hasAsset2ToAsset1 = true;
    }
  });
  const hasCompleteCycle = hasAsset1ToAsset2 && hasAsset2ToAsset1;
  let netAsset1 = 0;
  let netAsset2 = 0;
  group.swaps.forEach((swap) => {
    if (swap.c1 === group.asset1.currency && swap.i1 === group.asset1.issuer) {
      netAsset1 -= swap.v1;
      netAsset2 += swap.v2;
    } else {
      netAsset2 -= swap.v1;
      netAsset1 += swap.v2;
    }
  });
  let actualProfitAsset1 = 0;
  let actualProfitAsset2 = 0;
  if (hasCompleteCycle) {
    actualProfitAsset1 = Math.max(0, netAsset1);
    actualProfitAsset2 = Math.max(0, netAsset2);
  }
  const formattedNet1 = formatValueWithCommas(Math.abs(netAsset1));
  const formattedNet2 = formatValueWithCommas(Math.abs(netAsset2));
  const formattedProfit1 = formatValueWithCommas(Math.abs(actualProfitAsset1));
  const formattedProfit2 = formatValueWithCommas(Math.abs(actualProfitAsset2));

  return (
    <div
      style={{
        background: themes[theme].cardBackground,
        borderRadius: "15px",
        padding: "15px",
        margin: "12px 0",
        boxShadow: `0 4px 15px rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
        position: "relative",
        fontFamily: fonts[fontFamily],
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <div
          style={{
            fontSize: "1.1rem",
            fontWeight: "bold",
            color: themes[theme].primary,
          }}
        >
          <span
            style={{
              color: themes[theme].secondary,
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s ease",
              textShadow: `0 0 5px rgba(${hexToRgb(
                themes[theme].secondary
              )}, 0.5)`,
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = `0 0 10px rgba(${hexToRgb(
                themes[theme].secondary
              )}, 0.8)`;
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = `0 0 5px rgba(${hexToRgb(
                themes[theme].secondary
              )}, 0.5)`;
              e.target.style.transform = "scale(1)";
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onTokenClick) {
                onTokenClick({
                  currency1: group.asset1.currency,
                  issuer1: group.asset1.issuer,
                  currency2: group.asset2.currency,
                  issuer2: group.asset2.issuer,
                  pairKey: pairKey,
                });
              }
            }}
          >
            {as1}
          </span>
          /
          <span
            style={{
              color: themes[theme].secondary,
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s ease",
              textShadow: `0 0 5px rgba(${hexToRgb(
                themes[theme].secondary
              )}, 0.5)`,
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = `0 0 10px rgba(${hexToRgb(
                themes[theme].secondary
              )}, 0.8)`;
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = `0 0 5px rgba(${hexToRgb(
                themes[theme].secondary
              )}, 0.5)`;
              e.target.style.transform = "scale(1)";
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onTokenClick) {
                onTokenClick({
                  currency1: group.asset1.currency,
                  issuer1: group.asset1.issuer,
                  currency2: group.asset2.currency,
                  issuer2: group.asset2.issuer,
                  pairKey: pairKey,
                });
              }
            }}
          >
            {as2}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setHiddenPairs((prev) => {
                const newSet = new Set(prev);
                newSet.add(pairKey);
                return newSet;
              });
            }}
            style={{
              background: `rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
              color: themes[theme].secondary,
              border: `1px solid ${themes[theme].secondary}`,
              borderRadius: "12px",
              padding: "2px 8px",
              fontSize: "0.7rem",
              cursor: "pointer",
              fontWeight: "bold",
            }}
            title="Hide this pair"
          >
            ×
          </button>
          <div
            style={{
              fontSize: "0.8rem",
              color: themes[theme].text,
              background: `rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
              padding: "2px 8px",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setShowSwapList(!showSwapList);
            }}
            title="Click to view swap history"
          >
            {group.swaps.length} txs
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          marginBottom: "10px",
          color: themes[theme].textSecondary,
        }}
      ></div>
      <div
        style={{
          background: `rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
          borderRadius: "8px",
          padding: "10px",
          marginBottom: "10px",
          fontSize: "0.8rem",
          border: `1px solid rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "5px",
            color: themes[theme].text,
          }}
        >
          <span>
            <span style={{ color: themes[theme].secondary }}>
              Latest Position:
            </span>{" "}
            {currentPosition && (
              <span style={{ fontWeight: "bold" }}>
                {formatValueWithCommas(
                  currentPosition.direction
                    ? currentPosition.asset1Amount
                    : currentPosition.asset2Amount
                )}{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: "bold" }}
                >
                  {currentPosition.direction ? as1 : as2}
                </span>
                {" → "}
                {formatValueWithCommas(
                  currentPosition.direction
                    ? currentPosition.asset2Amount
                    : currentPosition.asset1Amount
                )}{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: "bold" }}
                >
                  {currentPosition.direction ? as2 : as1}
                </span>
              </span>
            )}
          </span>
          {livePriceReverseQuote && livePriceReverseQuote !== null ? (
            <span
              style={{
                fontWeight: "bold",
                color: livePriceReverseQuote.isProfit ? "#4ade80" : "#f87171",
              }}
            >
              {livePriceReverseQuote.isProfit ? "+" : ""}
              {livePriceReverseQuote.profitPercent.toFixed(2)}%
            </span>
          ) : livePriceReverseQuote === null ? (
            <span
              style={{ color: themes[theme].textSecondary, fontSize: "0.7rem" }}
            >
              No price data
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: themes[theme].textSecondary,
            marginTop: "5px",
          }}
        >
          {hasCompleteCycle ? (
            <>
              <span style={{ color: themes[theme].secondary }}>
                Realized Profit:
              </span>{" "}
              {netAsset1 >= 0 ? (
                <span style={{ color: "#4ade80" }}>
                  +{formattedNet1} {as1}
                </span>
              ) : (
                <span style={{ color: "#f87171" }}>
                  -{formattedNet1} {as1}
                </span>
              )}
              {", "}
              {netAsset2 >= 0 ? (
                <span style={{ color: "#4ade80" }}>
                  +{formattedNet2} {as2}
                </span>
              ) : (
                <span style={{ color: "#f87171" }}>
                  -{formattedNet2} {as2}
                </span>
              )}
            </>
          ) : (
            <>
              <span style={{ color: themes[theme].secondary }}>
                Net Position:
              </span>{" "}
              <span style={{ color: netAsset1 >= 0 ? "#4ade80" : "#f87171" }}>
                {netAsset1 >= 0 ? "+" : ""}
                {formattedNet1} {as1}
              </span>
              {", "}
              <span style={{ color: netAsset2 >= 0 ? "#4ade80" : "#f87171" }}>
                {netAsset2 >= 0 ? "+" : ""}
                {formattedNet2} {as2}
              </span>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: themes[theme].textSecondary,
                  marginTop: "2px",
                }}
              >
                (Complete buy/sell cycle needed for profit calculation)
              </div>
            </>
          )}
        </div>
        {livePriceReverseQuote && livePriceReverseQuote !== null && (
          <div
            style={{
              fontSize: "0.8rem",
              color: themes[theme].textSecondary,
              marginTop: "5px",
            }}
          >
            <span>Reverse position: </span>
            <span style={{ color: themes[theme].text }}>
              {formatValueWithCommas(livePriceReverseQuote.reverseAmount)}{" "}
              {formatCurrencyCode(livePriceReverseQuote.originalCurrency)}
            </span>
            <span
              style={{
                color: livePriceReverseQuote.isProfit ? "#4ade80" : "#f87171",
                marginLeft: "5px",
              }}
            >
              ({livePriceReverseQuote.isProfit ? "+" : ""}
              {livePriceReverseQuote.profitPercent.toFixed(2)}%)
            </span>
            <div
              style={{
                fontSize: "0.7rem",
                color: themes[theme].textSecondary,
                marginTop: "2px",
              }}
            >
              ({formatValueWithCommas(livePriceReverseQuote.receivedAmount)}{" "}
              {formatCurrencyCode(livePriceReverseQuote.receivedCurrency)}
              {" → "}
              {formatValueWithCommas(livePriceReverseQuote.reverseAmount)}{" "}
              {formatCurrencyCode(livePriceReverseQuote.originalCurrency)})
            </div>
          </div>
        )}
      </div>
      {showSwapList && (
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            background: themes[theme].cardBackground,
            border: `1px solid ${themes[theme].glassBorder}`,
            borderRadius: "12px",
            zIndex: 10,
            padding: "15px",
            boxShadow: `0 10px 30px rgba(${hexToRgb(
              themes[theme].primary
            )}, 0.3)`,
            backdropFilter: "blur(10px)",
            fontFamily: fonts[fontFamily],
            animation: "fadeIn 0.3s ease-out",
            overflowY: "auto",
          }}
        >
          {/* Popup Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
              paddingBottom: "10px",
              borderBottom: `1px solid ${themes[theme].glassBorder}`,
            }}
          >
            <h4
              style={{
                margin: 0,
                color: themes[theme].primary,
                fontSize: "1rem",
                fontWeight: "bold",
              }}
            >
              Swap History ({group.swaps.length})
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSwapList(false);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: themes[theme].textSecondary,
                cursor: "pointer",
                fontSize: "1.5rem",
                lineHeight: "1",
                padding: "0",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>

          {/* Swap List */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {group.swaps.map((swap, index) => (
              <div
                key={index}
                style={{
                  background: `rgba(${hexToRgb(themes[theme].primary)}, 0.1)`,
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "0.75rem",
                  border: `1px solid ${themes[theme].glassBorder}`,
                  transition: "all 0.2s ease",
                }}
              >
                {/* Date and Time */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "5px",
                  }}
                >
                  <span
                    style={{
                      color: themes[theme].secondary,
                      fontWeight: "bold",
                    }}
                  >
                    {new Date(swap.date).toLocaleDateString()}
                  </span>
                  <span style={{ color: themes[theme].textSecondary }}>
                    {new Date(swap.date).toLocaleTimeString()}
                  </span>
                </div>

                {/* Swap Details */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color: themes[theme].text,
                      fontWeight: "500",
                    }}
                  >
                    {formatValueWithCommas(swap.v1)}{" "}
                    {formatCurrencyCode(swap.c1)}
                  </span>
                  <span
                    style={{
                      color: themes[theme].primary,
                      fontWeight: "bold",
                      fontSize: "0.9rem",
                    }}
                  >
                    →
                  </span>
                  <span
                    style={{
                      color: themes[theme].text,
                      fontWeight: "500",
                    }}
                  >
                    {formatValueWithCommas(swap.v2)}{" "}
                    {formatCurrencyCode(swap.c2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PairsSection;

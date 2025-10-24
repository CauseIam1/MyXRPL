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
const tokenDataCache = new Map();
const SwapCard = ({
  group,
  isSelected,
  reverseQuote,
  handleSwapSelection,
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
}) => {
  const [showTokenDetails, setShowTokenDetails] = useState({
    asset1: false,
    asset2: false,
  });
  const as1 = formatCurrencyCode(group.asset1.currency);
  const as2 = formatCurrencyCode(group.asset2.currency);
  const truncatedI1 = truncateAddress(group.asset1.issuer);
  const truncatedI2 = truncateAddress(group.asset2.issuer);
  const pairKey = getPairKey(group.asset1, group.asset2);
  const latestSwap = group.swaps[0];
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
  const latestPosition = calculateLatestPosition();
  const TokenDetailPopup = ({ asset, position, onClose }) => {
    const [tokenInfo, setTokenInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
      const cacheKey = `${asset.currency}-${asset.issuer}`;
      if (tokenDataCache.has(cacheKey)) {
        setTokenInfo(tokenDataCache.get(cacheKey));
        setLoading(false);
        return;
      }
      const fetchTokenInfo = async () => {
        if (!asset.issuer || asset.currency === "XRP") {
          setLoading(false);
          return;
        }
        try {
          const data = await fetchComprehensiveTokenData(
            asset.currency,
            asset.issuer
          );
          tokenDataCache.set(cacheKey, data);
          setTokenInfo(data);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchTokenInfo();
    }, [asset]);
    if (loading) {
      return (
        <div
          style={{
            position: "absolute",
            top: position.top,
            left: position.left,
            background: themes[theme].cardBackground,
            border: `2px solid ${themes[theme].border}`,
            borderRadius: "10px",
            padding: "12px",
            zIndex: 1000,
            minWidth: "200px",
            boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
            color: themes[theme].text,
            fontFamily: fonts[fontFamily],
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "5px",
              right: "5px",
              background: `rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
              color: themes[theme].secondary,
              border: `1px solid ${themes[theme].secondary}`,
              borderRadius: "50%",
              width: "20px",
              height: "20px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            Loading token data...
          </div>
        </div>
      );
    }
    return (
      <div
        style={{
          position: "absolute",
          top: position.top,
          left: position.left,
          background: themes[theme].cardBackground,
          border: `2px solid ${themes[theme].border}`,
          borderRadius: "10px",
          padding: "12px",
          zIndex: 1000,
          minWidth: "280px",
          maxWidth: "350px",
          boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
          color: themes[theme].text,
          fontFamily: fonts[fontFamily],
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "5px",
            right: "5px",
            background: `rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
            color: themes[theme].secondary,
            border: `1px solid ${themes[theme].secondary}`,
            borderRadius: "50%",
            width: "20px",
            height: "20px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
          title="Close"
        >
          ×
        </button>
        <div
          style={{
            fontWeight: "bold",
            color: themes[theme].secondary,
            marginBottom: "8px",
            marginTop: "10px",
            fontSize: "1rem",
          }}
        >
          Token Details
        </div>
        <div style={{ fontSize: "0.85rem", marginBottom: "4px" }}>
          <strong>Currency:</strong> {asset.currency}
        </div>
        <div style={{ fontSize: "0.85rem", marginBottom: "4px" }}>
          <strong>Display Name:</strong> {formatCurrencyCode(asset.currency)}
        </div>
        <div style={{ fontSize: "0.85rem", marginBottom: "4px" }}>
          <strong>Issuer:</strong> {asset.issuer || "Native XRP"}
        </div>
        {asset.issuer && (
          <div
            style={{
              fontSize: "0.75rem",
              color: themes[theme].textSecondary,
              marginTop: "3px",
            }}
          >
            {truncateAddress(asset.issuer)}
          </div>
        )}
        {error && (
          <div
            style={{ fontSize: "0.8rem", color: "#f87171", marginTop: "8px" }}
          >
            Error: {error}
          </div>
        )}
        {tokenInfo && (
          <div
            style={{
              marginTop: "10px",
              paddingTop: "8px",
              borderTop: `1px solid ${themes[theme].border}`,
              fontSize: "0.8rem",
            }}
          >
            {tokenInfo.accountInfo && (
              <>
                <div style={{ marginBottom: "4px" }}>
                  <strong>XRP Balance:</strong>{" "}
                  {tokenInfo.accountInfo.xrpBalance?.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  XRP
                </div>
                <div style={{ marginBottom: "4px" }}>
                  <strong>Sequence:</strong>{" "}
                  {tokenInfo.accountInfo.sequence?.toLocaleString()}
                </div>
                <div style={{ marginBottom: "4px" }}>
                  <strong>Owner Count:</strong>{" "}
                  {tokenInfo.accountInfo.ownerCount?.toLocaleString()}
                </div>
              </>
            )}
            {tokenInfo.trustLines && (
              <>
                <div style={{ marginBottom: "4px", marginTop: "6px" }}>
                  <strong>Token Metrics:</strong>
                </div>
                <div style={{ marginBottom: "4px", paddingLeft: "8px" }}>
                  <strong>Total Supply:</strong>{" "}
                  {tokenInfo.trustLines.totalSupply
                    ? tokenInfo.trustLines.totalSupply.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 }
                      )
                    : "0"}
                </div>
                <div style={{ marginBottom: "4px", paddingLeft: "8px" }}>
                  <strong>Holders:</strong>{" "}
                  {tokenInfo.trustLines.holders?.toLocaleString() || "0"}
                </div>
                <div style={{ marginBottom: "4px", paddingLeft: "8px" }}>
                  <strong>Trustlines:</strong>{" "}
                  {tokenInfo.trustLines.trustlines?.toLocaleString() || "0"}
                </div>
              </>
            )}
          </div>
        )}
        <div
          style={{
            fontSize: "0.7rem",
            color: "#64748b",
            marginTop: "10px",
            paddingTop: "8px",
            borderTop: "1px solid rgba(39, 162, 219, 0.3)",
            fontStyle: "italic",
          }}
        ></div>
      </div>
    );
  };
  return (
    <div
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${themes[theme].primary}20, ${themes[theme].secondary}20)`
          : themes[theme].cardBackground,
        borderRadius: "15px",
        padding: "15px",
        margin: "12px 0",
        overflow: "hidden",
        boxShadow: isSelected
          ? `0 6px 20px rgba(${hexToRgb(themes[theme].primary)}, 0.4)`
          : `0 4px 15px rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
        cursor: "pointer",
        transition: "all 0.2s ease",
        position: "relative",
        fontFamily: fonts[fontFamily],
      }}
      onClick={() => handleSwapSelection(group.asset1, group.asset2)}
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
            color: isSelected ? "#000000" : themes[theme].primary,
          }}
        >
          <span
            style={{
              color: isSelected ? "#000000" : themes[theme].secondary,
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s ease",
              textShadow: isSelected
                ? "none"
                : `0 0 5px rgba(${hexToRgb(themes[theme].secondary)}, 0.5)`,
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                e.target.style.textShadow = `0 0 10px rgba(${hexToRgb(
                  themes[theme].secondary
                )}, 0.8)`;
                e.target.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                e.target.style.textShadow = `0 0 5px rgba(${hexToRgb(
                  themes[theme].secondary
                )}, 0.5)`;
                e.target.style.transform = "scale(1)";
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              setShowTokenDetails((prev) => ({
                ...prev,
                asset1: !prev.asset1,
              }));
            }}
          >
            {as1}
          </span>
          /
          <span
            style={{
              color: isSelected ? "#000000" : themes[theme].secondary,
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s ease",
              textShadow: isSelected
                ? "none"
                : `0 0 5px rgba(${hexToRgb(themes[theme].secondary)}, 0.5)`,
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                e.target.style.textShadow = `0 0 10px rgba(${hexToRgb(
                  themes[theme].secondary
                )}, 0.8)`;
                e.target.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                e.target.style.textShadow = `0 0 5px rgba(${hexToRgb(
                  themes[theme].secondary
                )}, 0.5)`;
                e.target.style.transform = "scale(1)";
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              setShowTokenDetails((prev) => ({
                ...prev,
                asset2: !prev.asset2,
              }));
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
            }}
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
      >
        <div>
          <span style={{ color: themes[theme].secondary }}>{as1}:</span>{" "}
          {truncatedI1}
        </div>
        <div>
          <span style={{ color: themes[theme].secondary }}>{as2}:</span>{" "}
          {truncatedI2}
        </div>
      </div>
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
            {latestPosition && (
              <span style={{ fontWeight: "bold" }}>
                {formatValueWithCommas(
                  latestPosition.direction
                    ? latestPosition.asset1Amount
                    : latestPosition.asset2Amount
                )}{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: "bold" }}
                >
                  {latestPosition.direction ? as1 : as2}
                </span>
                {" → "}
                {formatValueWithCommas(
                  latestPosition.direction
                    ? latestPosition.asset2Amount
                    : latestPosition.asset1Amount
                )}{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: "bold" }}
                >
                  {latestPosition.direction ? as2 : as1}
                </span>
              </span>
            )}
          </span>
          {reverseQuote && reverseQuote !== null ? (
            <span
              style={{
                fontWeight: "bold",
                color: reverseQuote.isProfit ? "#4ade80" : "#f87171",
              }}
            >
              {reverseQuote.isProfit ? "+" : ""}
              {reverseQuote.profitPercent.toFixed(2)}%
            </span>
          ) : reverseQuote === null ? (
            <span
              style={{ color: themes[theme].textSecondary, fontSize: "0.7rem" }}
            >
              No AMM pool
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
        {reverseQuote && reverseQuote !== null && (
          <div
            style={{
              fontSize: "0.8rem",
              color: themes[theme].textSecondary,
              marginTop: "5px",
            }}
          >
            <span>Reverse: </span>
            <span style={{ color: themes[theme].text }}>
              {formatValueWithCommas(reverseQuote.reverseAmount)} {as1}
            </span>
            <span
              style={{
                color: reverseQuote.isProfit ? "#4ade80" : "#f87171",
                marginLeft: "5px",
              }}
            >
              ({reverseQuote.isProfit ? "+" : ""}
              {formatValueWithCommas(Math.abs(reverseQuote.profitLoss))} {as1})
            </span>
          </div>
        )}
      </div>
      <div
        style={{
          maxHeight: "150px",
          overflowY: "auto",
          fontSize: "0.7rem",
        }}
      >
        {group.swaps.map((swap, swapIndex) => {
          const swapDate = new Date(swap.date).toLocaleDateString();
          const fromCurrency = formatCurrencyCode(swap.c1);
          const toCurrency = formatCurrencyCode(swap.c2);
          const fromAmount = formatValueWithCommas(swap.v1);
          const toAmount = formatValueWithCommas(swap.v2);
          return (
            <div
              key={swapIndex}
              style={{
                background: `rgba(${hexToRgb(themes[theme].primary)}, 0.1)`,
                borderRadius: "4px",
                padding: "6px 8px",
                marginBottom: "4px",
                border: `1px solid rgba(${hexToRgb(
                  themes[theme].primary
                )}, 0.2)`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: themes[theme].text,
              }}
            >
              <div>
                {fromAmount}{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: "bold" }}
                >
                  {fromCurrency}
                </span>
                {" → "}
                {toAmount}{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: "bold" }}
                >
                  {toCurrency}
                </span>
              </div>
              <div
                style={{
                  color: themes[theme].textSecondary,
                  fontSize: "0.65rem",
                  whiteSpace: "nowrap",
                  marginLeft: "5px",
                }}
              >
                {swapDate}
              </div>
            </div>
          );
        })}
      </div>
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: "5px",
            right: "5px",
            background: themes[theme].secondary,
            color: "#0f1c2e",
            fontSize: "0.7rem",
            padding: "2px 6px",
            borderRadius: "10px",
            fontWeight: "bold",
          }}
        >
          ACTIVE
        </div>
      )}
      {showTokenDetails.asset1 && (
        <TokenDetailPopup
          asset={group.asset1}
          position={{ top: "50px", left: "20px" }}
          onClose={() =>
            setShowTokenDetails((prev) => ({ ...prev, asset1: false }))
          }
        />
      )}
      {showTokenDetails.asset2 && (
        <TokenDetailPopup
          asset={group.asset2}
          position={{ top: "50px", right: "20px" }}
          onClose={() =>
            setShowTokenDetails((prev) => ({ ...prev, asset2: false }))
          }
        />
      )}
    </div>
  );
};

export default SwapCard;

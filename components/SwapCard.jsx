import React, { useState } from "react";

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

  // Get latest swap for summary
  const latestSwap = group.swaps[0];

  // Check if we have trades in both directions
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

  // Calculate net position for this pair
  let netAsset1 = 0;
  let netAsset2 = 0;

  group.swaps.forEach((swap) => {
    if (swap.c1 === group.asset1.currency && swap.i1 === group.asset1.issuer) {
      // Selling asset1, buying asset2
      netAsset1 -= swap.v1;
      netAsset2 += swap.v2;
    } else {
      // Selling asset2, buying asset1
      netAsset2 -= swap.v1;
      netAsset1 += swap.v2;
    }
  });

  // Calculate actual profit/loss only if we have complete cycles
  let actualProfitAsset1 = 0;
  let actualProfitAsset2 = 0;

  if (hasCompleteCycle) {
    // For complete cycles, calculate real profit/loss
    actualProfitAsset1 = Math.max(0, netAsset1);
    actualProfitAsset2 = Math.max(0, netAsset2);
  }

  const formattedNet1 = formatValueWithCommas(Math.abs(netAsset1));
  const formattedNet2 = formatValueWithCommas(Math.abs(netAsset2));
  const formattedProfit1 = formatValueWithCommas(Math.abs(actualProfitAsset1));
  const formattedProfit2 = formatValueWithCommas(Math.abs(actualProfitAsset2));

  // Token detail popup component
  const TokenDetailPopup = ({ asset, position, onClose }) => (
    <div
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
        border: "2px solid #27a2db",
        borderRadius: "10px",
        padding: "12px",
        zIndex: 1000,
        minWidth: "200px",
        boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
        color: "#ffffff",
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "5px",
          right: "5px",
          background: "rgba(218, 41, 28, 0.3)",
          color: "#f87171",
          border: "1px solid #f87171",
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
          color: "#60a5fa",
          marginBottom: "8px",
          marginTop: "10px",
        }}
      >
        Token Details
      </div>
      <div style={{ fontSize: "0.9rem", marginBottom: "5px" }}>
        <strong>Currency:</strong> {asset.currency}
      </div>
      <div style={{ fontSize: "0.9rem", marginBottom: "5px" }}>
        <strong>Issuer:</strong> {asset.issuer || "Native XRP"}
      </div>
      {asset.issuer && (
        <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "5px" }}>
          {truncateAddress(asset.issuer)}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        background: isSelected
          ? "linear-gradient(135deg, #00bfcf, #0052cc)"
          : "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
        borderRadius: "15px",
        padding: "15px",
        margin: "12px 0",
        overflow: "hidden",
        boxShadow: isSelected
          ? "0 6px 20px rgba(39, 162, 219, 0.4)"
          : "0 4px 15px rgba(39, 162, 219, 0.2)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        position: "relative",
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
            color: isSelected ? "#ffffff" : "#27a2db",
          }}
        >
          {/* TOKEN NAMES WITH HOVER AND CLICK HANDLERS */}
          <span
            style={{
              color: "#60a5fa",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s ease",
              textShadow: "0 0 5px rgba(96, 165, 250, 0.5)",
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = "0 0 10px rgba(96, 165, 250, 0.8)";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = "0 0 5px rgba(96, 165, 250, 0.5)";
              e.target.style.transform = "scale(1)";
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
              color: "#60a5fa",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s ease",
              textShadow: "0 0 5px rgba(96, 165, 250, 0.5)",
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = "0 0 10px rgba(96, 165, 250, 0.8)";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              e.target.style.textShadow = "0 0 5px rgba(96, 165, 250, 0.5)";
              e.target.style.transform = "scale(1)";
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
              background: "rgba(218, 41, 28, 0.3)",
              color: "#f87171",
              border: "1px solid #f87171",
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
              color: "#ffffff",
              background: "rgba(39, 162, 219, 0.3)",
              padding: "2px 8px",
              borderRadius: "12px",
            }}
          >
            {group.swaps.length} txs
          </div>
        </div>
      </div>

      {/* Condensed Asset Info */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          marginBottom: "10px",
          color: "#cbd5e1",
        }}
      >
        <div>
          <span style={{ color: "#60a5fa" }}>{as1}:</span> {truncatedI1}
        </div>
        <div>
          <span style={{ color: "#60a5fa" }}>{as2}:</span> {truncatedI2}
        </div>
      </div>

      {/* Latest Swap Summary with Reverse Quote */}
      <div
        style={{
          background: "rgba(30, 58, 95, 0.5)",
          borderRadius: "8px",
          padding: "10px",
          marginBottom: "10px",
          fontSize: "0.8rem",
          border: "1px solid rgba(39, 162, 219, 0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "5px",
            color: "#e2e8f0",
          }}
        >
          <span>
            <span style={{ color: "#60a5fa" }}>Latest:</span>{" "}
            <span style={{ fontWeight: "bold" }}>
              {formatValueWithCommas(latestSwap.v1)}{" "}
              <span style={{ color: "#60a5fa", fontWeight: "bold" }}>
                {formatCurrencyCode(latestSwap.c1)}
              </span>
              {" → "}
              {formatValueWithCommas(latestSwap.v2)}{" "}
              <span style={{ color: "#60a5fa", fontWeight: "bold" }}>
                {formatCurrencyCode(latestSwap.c2)}
              </span>
            </span>
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
            <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>
              No AMM pool
            </span>
          ) : null}
        </div>

        {/* Net Position or Profit Display */}
        <div
          style={{
            fontSize: "0.75rem",
            color: "#cbd5e1",
            marginTop: "5px",
          }}
        >
          {hasCompleteCycle ? (
            <>
              <span style={{ color: "#60a5fa" }}>Realized Profit:</span>{" "}
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
              <span style={{ color: "#60a5fa" }}>Net Position:</span>{" "}
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
                  color: "#94a3b8",
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
              color: "#94a3b8",
              marginTop: "5px",
            }}
          >
            <span>Reverse: </span>
            <span style={{ color: "#e2e8f0" }}>
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

      {/* All Swaps List (condensed) - FIXED DIRECTION DISPLAY */}
      <div
        style={{
          maxHeight: "150px",
          overflowY: "auto",
          fontSize: "0.7rem",
        }}
      >
        {group.swaps.map((swap, swapIndex) => {
          const swapDate = new Date(swap.date).toLocaleDateString();

          // Determine the actual direction of this specific swap
          const fromCurrency = formatCurrencyCode(swap.c1);
          const toCurrency = formatCurrencyCode(swap.c2);
          const fromAmount = formatValueWithCommas(swap.v1);
          const toAmount = formatValueWithCommas(swap.v2);

          return (
            <div
              key={swapIndex}
              style={{
                background: "rgba(15, 23, 42, 0.7)",
                borderRadius: "4px",
                padding: "6px 8px",
                marginBottom: "4px",
                border: "1px solid rgba(39, 162, 219, 0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "#e2e8f0",
              }}
            >
              <div>
                {fromAmount}{" "}
                <span style={{ color: "#60a5fa", fontWeight: "bold" }}>
                  {fromCurrency}
                </span>
                {" → "}
                {toAmount}{" "}
                <span style={{ color: "#60a5fa", fontWeight: "bold" }}>
                  {toCurrency}
                </span>
              </div>
              <div
                style={{
                  color: "#94a3b8",
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

      {/* Selection indicator */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: "5px",
            right: "5px",
            background: "#60a5fa",
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

      {/* Token Detail Popups with Close Buttons */}
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

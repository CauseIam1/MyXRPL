import React from "react";

const TokenAnalyzer = ({
  error,
  loadingTransactions,
  loadingProgress,
  transactions,
  batchReverseLoading,
  batchReverseProgress,
  hiddenPairs,
  tokenPrices,
  ledgerIndex,
  loadTransactions,
  renderProgressBar,
  renderPriceUpdateProgress,
  getPairKey,
  formatCurrencyCode,
  formatValueWithCommas,
  truncateAddress,
  fetchComprehensiveTokenData,
  theme,
  themes,
  fontFamily,
  fonts,
  calculatePositionWithLivePrices,
  calculateReverseLatestPosition,
  setHiddenPairs,
  SwapCard,
}) => {
  if (error) {
    return (
      <div
        style={{
          background: "rgba(218, 41, 28, 0.2)",
          color: "#f87171",
          padding: "12px",
          borderRadius: "5px",
          margin: "15px 0",
          textAlign: "center",
          border: "1px solid rgba(218, 41, 28, 0.3)",
          fontSize: "0.9rem",
        }}
      >
        {error}
        <button
          onClick={loadTransactions}
          style={{
            background: "linear-gradient(135deg, #27a2db, #1565c0)",
            color: "#ffffff",
            border: "none",
            padding: "8px 15px",
            borderRadius: "20px",
            cursor: "pointer",
            fontWeight: "bold",
            marginTop: "10px",
            marginLeft: "10px",
          }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (loadingTransactions) {
    return renderProgressBar(
      loadingProgress,
      "🔍 Analyzing your AMM swap history..."
    );
  }
  if (transactions.length === 0 && !loadingTransactions) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "20px",
          color: "#94a3b8",
          fontStyle: "italic",
          fontSize: "0.85rem",
        }}
      >
        <p>Wait until the ledger connects then hit it!</p>
        <button
          onClick={() => {
            loadTransactions();
          }}
          style={{
            background: "linear-gradient(135deg, #27a2db, #1565c0)",
            color: "#ffffff",
            border: "none",
            padding: "12px 20px",
            borderRadius: "25px",
            cursor: "pointer",
            fontWeight: "bold",
            marginTop: "15px",
            fontSize: "1rem",
          }}
        >
          🔍 Flip The Switch
        </button>
        <div
          style={{
            marginTop: "15px",
            fontSize: "0.8rem",
            color: "#64748b",
          }}
        >
          Current ledger: {ledgerIndex}
        </div>
      </div>
    );
  }

  const groupedSwaps = {};
  transactions.forEach((swap) => {
    const pairKey = getPairKey(
      { currency: swap.c1, issuer: swap.i1 },
      { currency: swap.c2, issuer: swap.i2 }
    );
    if (!groupedSwaps[pairKey]) {
      groupedSwaps[pairKey] = {
        asset1: { currency: swap.c1, issuer: swap.i1 },
        asset2: { currency: swap.c2, issuer: swap.i2 },
        swaps: [],
      };
    }
    groupedSwaps[pairKey].swaps.push(swap);
  });
  const swapGroups = Object.values(groupedSwaps)
    .map((group) => {
      group.swaps.sort((a, b) => new Date(b.date) - new Date(a.date));
      return group;
    })
    .sort((a, b) => {
      const pairKeyA = getPairKey(a.asset1, a.asset2);
      const pairKeyB = getPairKey(b.asset1, b.asset2);
      const reverseQuoteA = calculatePositionWithLivePrices(a, tokenPrices);
      const reverseQuoteB = calculatePositionWithLivePrices(b, tokenPrices);
      const profitA = reverseQuoteA ? reverseQuoteA.profitPercent : -Infinity;
      const profitB = reverseQuoteB ? reverseQuoteB.profitPercent : -Infinity;
      return profitB - profitA;
    });
  const visibleSwapGroups = swapGroups.filter((group) => {
    const pairKey = getPairKey(group.asset1, group.asset2);
    const containsXRP =
      group.asset1.currency === "XRP" || group.asset2.currency === "XRP";
    return !hiddenPairs.has(pairKey) && !containsXRP;
  });

  return (
    <div id="analyze-swaps-container">
      {batchReverseLoading &&
        renderProgressBar(
          batchReverseProgress,
          "🔄 Calculating Reverse Positions... fetching live prices for each pair"
        )}
      {renderPriceUpdateProgress()}
      {visibleSwapGroups.map((group, groupIndex) => (
        <SwapCard
          key={groupIndex}
          group={group}
          setHiddenPairs={setHiddenPairs}
          getPairKey={getPairKey}
          formatCurrencyCode={formatCurrencyCode}
          formatValueWithCommas={formatValueWithCommas}
          truncateAddress={truncateAddress}
          fetchComprehensiveTokenData={fetchComprehensiveTokenData}
          theme={theme}
          themes={themes}
          fontFamily={fontFamily}
          fonts={fonts}
          tokenPrices={tokenPrices}
          calculateReverseLatestPosition={calculateReverseLatestPosition}
        />
      ))}
    </div>
  );
};

export default TokenAnalyzer;

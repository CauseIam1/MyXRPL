import { formatCurrencyCode } from "./formatters";
import { getPairKey } from "./formatters";
export const findArbitrageChains = (
  swapGroups,
  reverseQuotes,
  hiddenPairs,
  chainProfitThreshold = 0.5
) => {
  const chains = [];
  const maxChainLength = 4;
  const visibleSwapGroups = swapGroups.filter((group) => {
    const pairKey = getPairKey(group.asset1, group.asset2);
    const containsXRP =
      group.asset1.currency === "XRP" || group.asset2.currency === "XRP";
    return !hiddenPairs.has(pairKey) && !containsXRP;
  });
  const pairsData = visibleSwapGroups.map((group, index) => {
    const pairKey = getPairKey(group.asset1, group.asset2);
    const reverseQuote = reverseQuotes[pairKey];
    if (reverseQuote) {
      return {
        index,
        asset1: group.asset1,
        asset2: group.asset2,
        group,
        reverseQuote,
        isProfitable:
          reverseQuote.isProfit &&
          reverseQuote.profitPercent >= chainProfitThreshold,
        pairKey: pairKey,
        profitPercent: reverseQuote.profitPercent,
        fromCurrency: reverseQuote.originalCurrency,
        fromIssuer:
          reverseQuote.originalCurrency === group.asset1.currency
            ? group.asset1.issuer
            : group.asset2.issuer,
        toCurrency: reverseQuote.receivedCurrency,
        toIssuer:
          reverseQuote.receivedCurrency === group.asset1.currency
            ? group.asset1.issuer
            : group.asset2.issuer,
        fromAmount: reverseQuote.originalAmount,
        toAmount: reverseQuote.receivedAmount,
      };
    }
    return {
      index,
      asset1: group.asset1,
      asset2: group.asset2,
      group,
      reverseQuote: null,
      isProfitable: false,
      pairKey: pairKey,
      profitPercent: 0,
      fromCurrency: group.asset1.currency,
      fromIssuer: group.asset1.issuer,
      toCurrency: group.asset2.currency,
      toIssuer: group.asset2.issuer,
      fromAmount: 0,
      toAmount: 0,
    };
  });
  const profitablePairs = pairsData.filter(
    (pair) => pair.isProfitable && pair.profitPercent >= 0
  );
  if (profitablePairs.length < 2) {
    return [];
  }
  profitablePairs.forEach((startPair) => {
    const chain = [startPair];
    findNextChainLink(
      profitablePairs,
      chain,
      1,
      maxChainLength,
      chains,
      chainProfitThreshold
    );
  });
  chains.sort((a, b) => b.totalProfitPercent - a.totalProfitPercent);
  return chains.slice(0, 10);
};

const findNextChainLink = (
  profitablePairs,
  currentChain,
  currentDepth,
  maxDepth,
  chains,
  chainProfitThreshold
) => {
  if (currentDepth >= maxDepth) {
    const totalProfitPercent = currentChain.reduce(
      (sum, pair) => sum + (pair.profitPercent || 0),
      0
    );
    if (totalProfitPercent >= chainProfitThreshold) {
      chains.push({
        pairs: [...currentChain],
        totalProfitPercent,
        chainPath: currentChain
          .map(
            (pair) =>
              `${formatCurrencyCode(pair.fromCurrency)}→${formatCurrencyCode(
                pair.toCurrency
              )}`
          )
          .join(" → "),
      });
    }
    return;
  }
  const lastPair = currentChain[currentChain.length - 1];
  const usedPairs = new Set();
  currentChain.forEach((pair) => {
    const canonicalKey = [pair.fromCurrency, pair.toCurrency].sort().join("|");
    usedPairs.add(canonicalKey);
  });

  profitablePairs.forEach((nextPair) => {
    const canonicalKey = [nextPair.fromCurrency, nextPair.toCurrency]
      .sort()
      .join("|");
    if (usedPairs.has(canonicalKey)) {
      return;
    }
    if (currentChain.some((pair) => pair.index === nextPair.index)) {
      return;
    }
    const matchesForward =
      nextPair.fromCurrency === lastPair.toCurrency &&
      nextPair.fromIssuer === lastPair.toIssuer;

    if (matchesForward && nextPair.isProfitable) {
      const newChain = [...currentChain, nextPair];
      findNextChainLink(
        profitablePairs,
        newChain,
        currentDepth + 1,
        maxDepth,
        chains,
        chainProfitThreshold
      );
    }
  });
};

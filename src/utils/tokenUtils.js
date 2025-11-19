import { formatCurrencyCode } from "./formatters";

export const calculateRealizedProfitsByToken = (
  transactions,
  hiddenPairs,
  formatCurrencyCode,
  formatValueWithCommas
) => {
  const visiblePairs = new Set();
  const groupedSwaps = {};
  transactions.forEach((swap) => {
    const pairKey = getPairKey(
      { currency: swap.c1, issuer: swap.i1 },
      { currency: swap.c2, issuer: swap.i2 }
    );
    const containsXRP = swap.c1 === "XRP" || swap.c2 === "XRP";
    if (!hiddenPairs.has(pairKey) && !containsXRP) {
      visiblePairs.add(pairKey);
      if (!groupedSwaps[pairKey]) {
        groupedSwaps[pairKey] = {
          asset1: { currency: swap.c1, issuer: swap.i1 },
          asset2: { currency: swap.c2, issuer: swap.i2 },
          swaps: [],
        };
      }
      groupedSwaps[pairKey].swaps.push(swap);
    }
  });

  const tokenBalances = {};
  Object.values(groupedSwaps).forEach((group) => {
    group.swaps.forEach((swap) => {
      if (swap.c1 === "XRP" || swap.c2 === "XRP") {
        return;
      }
      const formattedC1 = formatCurrencyCode(swap.c1);
      const formattedC2 = formatCurrencyCode(swap.c2);
      const soldTokenKey = `${formattedC1}-${swap.i1 || "null"}`;
      const boughtTokenKey = `${formattedC2}-${swap.i2 || "null"}`;
      if (!tokenBalances[soldTokenKey]) {
        tokenBalances[soldTokenKey] = {
          currency: formattedC1,
          originalCurrency: swap.c1,
          issuer: swap.i1,
          balance: 0,
          totalNetAmount: 0,
        };
      }
      tokenBalances[soldTokenKey].balance -= swap.v1;
      tokenBalances[soldTokenKey].totalNetAmount =
        tokenBalances[soldTokenKey].balance;
      if (!tokenBalances[boughtTokenKey]) {
        tokenBalances[boughtTokenKey] = {
          currency: formattedC2,
          originalCurrency: swap.c2,
          issuer: swap.i2,
          balance: 0,
          totalNetAmount: 0,
        };
      }
      tokenBalances[boughtTokenKey].balance += swap.v2;
      tokenBalances[boughtTokenKey].totalNetAmount =
        tokenBalances[boughtTokenKey].balance;
    });
  });
  const profitableTokens = [];
  const deficitTokens = [];
  Object.values(tokenBalances).forEach((token) => {
    if (Math.abs(token.balance) > 0.000001) {
      const formattedToken = {
        ...token,
        totalNetAmount: token.balance,
        formattedAmount: formatValueWithCommas(Math.abs(token.balance)),
        pairCount: 0,
        totalProfitPercent: 0,
        averageProfitPercent: 0,
        formattedAverageProfit: "0.00",
      };
      if (token.balance > 0) {
        profitableTokens.push(formattedToken);
      } else {
        deficitTokens.push(formattedToken);
      }
    }
  });

  const consolidateTokens = (tokens) => {
    const consolidated = new Map();
    tokens.forEach((token) => {
      const key = `${token.currency}-${token.issuer || "null"}`;
      if (consolidated.has(key)) {
        const existing = consolidated.get(key);
        existing.totalNetAmount += token.totalNetAmount;
        existing.balance += token.balance;
      } else {
        consolidated.set(key, {
          ...token,
          totalNetAmount: token.totalNetAmount,
        });
      }
    });
    return Array.from(consolidated.values()).map((token) => ({
      ...token,
      formattedAmount: formatValueWithCommas(Math.abs(token.totalNetAmount)),
    }));
  };
  const consolidatedProfitable = consolidateTokens(profitableTokens);
  const consolidatedDeficit = consolidateTokens(deficitTokens);
  return {
    profitable: consolidatedProfitable.sort(
      (a, b) => b.totalNetAmount - a.totalNetAmount
    ),
    deficit: consolidatedDeficit.sort(
      (a, b) => a.totalNetAmount - b.totalNetAmount
    ),
  };
};

const getPairKey = (asset1, asset2) => {
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

export const calculateReverseLatestPosition = (latestSwap, tokenPrices) => {
  if (!latestSwap) return null;
  const { c1, i1, v1, c2, i2, v2 } = latestSwap;
  const priceKey1 = `${c1}-${i1}`;
  const priceKey2 = `${c2}-${i2}`;
  const price1 = c1 === "XRP" ? 1 : tokenPrices[priceKey1];
  const price2 = c2 === "XRP" ? 1 : tokenPrices[priceKey2];
  if (
    (c1 !== "XRP" && (!price1 || price1 <= 0)) ||
    (c2 !== "XRP" && (!price2 || price2 <= 0))
  ) {
    return null;
  }
  const xrpValue1 = c1 === "XRP" ? v1 : v1 * price1;
  const xrpValue2 = c2 === "XRP" ? v2 : v2 * price2;
  const tradingFee = 0.01;
  let reverseXrpValue, reverseTokenValue, reverseCurrency;
  if (c2 !== "XRP") {
    const reverseAmountAfterFee = xrpValue2 * (1 - tradingFee);
    reverseXrpValue = reverseAmountAfterFee;
    reverseTokenValue =
      c1 === "XRP" ? reverseXrpValue : reverseXrpValue / price1;
    reverseCurrency = c1;
  } else {
    const reverseAmountAfterFee = xrpValue2 * (1 - tradingFee);
    reverseXrpValue = reverseAmountAfterFee;
    reverseTokenValue =
      c1 === "XRP" ? reverseXrpValue : reverseXrpValue / price1;
    reverseCurrency = c1;
  }
  const profitLoss = reverseTokenValue - v1;
  const profitPercent = (profitLoss / v1) * 100;
  return {
    reverseAmount: reverseTokenValue,
    reverseCurrency: reverseCurrency,
    profitLoss: profitLoss,
    profitPercent: profitPercent,
    isProfit: profitLoss > 0,
    originalAmount: v1,
    originalCurrency: c1,
    receivedAmount: v2,
    receivedCurrency: c2,
    xrpValue1: xrpValue1,
    xrpValue2: xrpValue2,
  };
};

export const calculateReverseQuote = (swap, poolData, tokenPrices) => {
  if (!tokenPrices || !swap) return null;
  try {
    const priceKey1 = `${swap.c1}-${swap.i1}`;
    const priceKey2 = `${swap.c2}-${swap.i2}`;
    const price1 = swap.c1 === "XRP" ? 1 : tokenPrices[priceKey1];
    const price2 = swap.c2 === "XRP" ? 1 : tokenPrices[priceKey2];
    if (
      (swap.c1 !== "XRP" && (!price1 || price1 <= 0)) ||
      (swap.c2 !== "XRP" && (!price2 || price2 <= 0))
    ) {
      return null;
    }
    const amountToSell = swap.v2;
    const baseAmount = swap.v1;
    const xrpValueReceived =
      swap.c2 === "XRP" ? amountToSell : amountToSell * price2;
    const xrpValueSent = swap.c1 === "XRP" ? baseAmount : baseAmount * price1;
    const tradingFee = 0.03;
    const xrpAfterFee = xrpValueReceived * (1 - tradingFee);
    const reverseAmount =
      swap.c1 === "XRP" ? xrpAfterFee : xrpAfterFee / price1;
    const profitLoss = reverseAmount - baseAmount;
    const profitPercent = (profitLoss / baseAmount) * 100;
    return {
      reverseAmount: reverseAmount,
      profitLoss: profitLoss,
      profitPercent: profitPercent,
      isProfit: profitLoss > 0,
      originalSwap: {
        sentAmount: swap.v1,
        receivedAmount: swap.v2,
        sentCurrency: swap.c1,
        receivedCurrency: swap.c2,
      },
      originalAmount: baseAmount,
      originalCurrency: swap.c1,
      receivedAmount: amountToSell,
      receivedCurrency: swap.c2,
    };
  } catch (error) {
    return null;
  }
};

export const calculatePositionWithLivePrices = (group, tokenPrices) => {
  if (!tokenPrices || group.swaps.length === 0) return null;
  const latestSwap = group.swaps[0];
  const isLatestDirectionAsset1ToAsset2 =
    latestSwap.c1 === group.asset1.currency &&
    latestSwap.i1 === group.asset1.issuer;
  const priceKey1 = `${group.asset1.currency}-${group.asset1.issuer}`;
  const priceKey2 = `${group.asset2.currency}-${group.asset2.issuer}`;
  const price1 = group.asset1.currency === "XRP" ? 1 : tokenPrices[priceKey1];
  const price2 = group.asset2.currency === "XRP" ? 1 : tokenPrices[priceKey2];
  if (
    (group.asset1.currency !== "XRP" && (!price1 || price1 <= 0)) ||
    (group.asset2.currency !== "XRP" && (!price2 || price2 <= 0))
  ) {
    return null;
  }
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
  const xrpValue1 =
    group.asset1.currency === "XRP" ? totalAsset1 : totalAsset1 * price1;
  const xrpValue2 =
    group.asset2.currency === "XRP" ? totalAsset2 : totalAsset2 * price2;
  const tradingFee = 0.023;
  let reverseAmount, reverseCurrency, profitLoss, profitPercent;
  if (isLatestDirectionAsset1ToAsset2) {
    const xrpAfterFee = xrpValue2 * (1 - tradingFee);
    reverseAmount =
      group.asset1.currency === "XRP" ? xrpAfterFee : xrpAfterFee / price1;
    reverseCurrency = group.asset1.currency;
    profitLoss = reverseAmount - totalAsset1;
    profitPercent = (profitLoss / totalAsset1) * 100;
  } else {
    const xrpAfterFee = xrpValue1 * (1 - tradingFee);
    reverseAmount =
      group.asset2.currency === "XRP" ? xrpAfterFee : xrpAfterFee / price2;
    reverseCurrency = group.asset2.currency;
    profitLoss = reverseAmount - totalAsset2;
    profitPercent = (profitLoss / totalAsset2) * 100;
  }
  return {
    reverseAmount: reverseAmount,
    profitLoss: profitLoss,
    profitPercent: profitPercent,
    isProfit: profitLoss > 0,
    originalAmount: isLatestDirectionAsset1ToAsset2 ? totalAsset1 : totalAsset2,
    originalCurrency: isLatestDirectionAsset1ToAsset2
      ? group.asset1.currency
      : group.asset2.currency,
    receivedAmount: isLatestDirectionAsset1ToAsset2 ? totalAsset2 : totalAsset1,
    receivedCurrency: isLatestDirectionAsset1ToAsset2
      ? group.asset2.currency
      : group.asset1.currency,
    xrpValue1: xrpValue1,
    xrpValue2: xrpValue2,
  };
};

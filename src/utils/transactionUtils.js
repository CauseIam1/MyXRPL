import { getPairKey } from "./formatters";
export const START_LEDGER = 95000589;
export const isTokenSwapTransaction = (item) => {
  const tx = item.tx;
  const meta = item.meta || item.metaData;
  if (!tx || !meta) return false;
  if (tx.TransactionType === "Payment") {
    const sendAmount = tx.SendMax || tx.Amount;
    const deliveredAmount = meta?.DeliveredAmount || tx.Amount;
    const hasSend =
      sendAmount &&
      (typeof sendAmount === "string" ||
        (typeof sendAmount === "object" && sendAmount.currency));
    const hasReceive =
      deliveredAmount &&
      (typeof deliveredAmount === "string" ||
        (typeof deliveredAmount === "object" && deliveredAmount.currency));
    return hasSend && hasReceive;
  }
  return false;
};

export const extractTokenSwapData = (item) => {
  const tx = item.tx;
  const meta = item.meta || item.metaData;
  if (!tx || !meta) return null;
  let c1, i1, v1;
  let c2, i2, v2;
  const sendAmount = tx.SendMax || tx.Amount;
  if (sendAmount) {
    if (typeof sendAmount === "string") {
      c1 = "XRP";
      i1 = tx.Account;
      v1 = Math.abs(parseFloat(sendAmount) / 1000000);
    } else if (
      typeof sendAmount === "object" &&
      sendAmount.currency &&
      sendAmount.value !== undefined
    ) {
      c1 = sendAmount.currency;
      i1 = sendAmount.issuer;
      v1 = Math.abs(parseFloat(sendAmount.value));
    }
  }
  const deliveredAmount = meta?.DeliveredAmount || tx.Amount;
  if (deliveredAmount) {
    if (typeof deliveredAmount === "string") {
      c2 = "XRP";
      i2 = tx.Destination;
      v2 = Math.abs(parseFloat(deliveredAmount) / 1000000);
    } else if (
      typeof deliveredAmount === "object" &&
      deliveredAmount.currency &&
      deliveredAmount.value !== undefined
    ) {
      c2 = deliveredAmount.currency;
      i2 = deliveredAmount.issuer;
      v2 = Math.abs(parseFloat(deliveredAmount.value));
    }
  }
  if (c1 && v1 && !isNaN(v1) && v1 > 0 && c2 && v2 && !isNaN(v2) && v2 > 0) {
    if (c1 === c2 && i1 === i2) {
      return null;
    }
    let timestamp = tx.date || item.date || Math.floor(Date.now() / 1000);
    const rippleEpochOffset = 946684800;
    const jsTimestamp = (timestamp + rippleEpochOffset) * 1000;
    const swapDate = new Date(jsTimestamp);
    return {
      hash: tx.hash,
      c1,
      i1,
      v1,
      c2,
      i2,
      v2,
      asa1: v1,
      asa2: v2,
      date: swapDate.toISOString(),
      direction: `${c1}/${c2}`,
      ratio: v2 / v1,
      fromAsset: { currency: c1, issuer: i1, amount: v1 },
      toAsset: { currency: c2, issuer: i2, amount: v2 },
    };
  }
  return null;
};

export const sortAndProcessTransactions = (allTransactions) => {
  const transactionTypes = {};
  allTransactions.forEach((item) => {
    const type = item.tx?.TransactionType || "Unknown";
    transactionTypes[type] = (transactionTypes[type] || 0) + 1;
  });
  const pairTransactions = [];
  const totalTransactions = allTransactions.length;
  allTransactions.forEach((item, index) => {
    if (index % Math.max(1, Math.floor(totalTransactions / 10)) === 0) {
    }
    if (isTokenSwapTransaction(item)) {
      pairTransactions.push(item);
    }
  });
  let swaps = [];
  const totalPairTransactions = pairTransactions.length;
  pairTransactions.forEach((item, index) => {
    if (index % Math.max(1, Math.floor(totalPairTransactions / 10)) === 0) {
    }
    const swapData = extractTokenSwapData(item);
    if (swapData) {
      swaps.push(swapData);
    }
  });
  swaps.sort((a, b) => new Date(b.date) - new Date(a.date));
  return {
    swaps: swaps,
  };
};

export const minimizeTransactionData = (transactions) => {
  const recentTransactions = transactions.slice(0, 500);
  return recentTransactions
    .map((tx) => ({
      h: tx.hash?.substring(0, 16),
      t: tx.date,
      c1: tx.c1,
      i1: tx.i1?.substring(0, 10),
      v1: Math.round(tx.v1 * 1000000) / 1000000,
      c2: tx.c2,
      i2: tx.i2?.substring(0, 10),
      v2: Math.round(tx.v2 * 1000000) / 1000000,
    }))
    .filter((tx) => tx.h && tx.t && tx.c1 && tx.c2);
};

export const extractEssentialSwapData = (item) => {
  const tx = item.tx;
  const meta = item.meta || item.metaData;
  if (!tx || !meta) return null;
  return {
    c1:
      tx.SendMax?.currency ||
      (typeof tx.Amount === "object" ? tx.Amount.currency : "XRP"),
    i1: tx.SendMax?.issuer || tx.Account,
    v1:
      typeof tx.SendMax === "object"
        ? tx.SendMax?.value || 0
        : typeof tx.Amount === "string"
        ? parseFloat(tx.Amount) / 1000000
        : tx.Amount?.value || 0,
    c2:
      meta.DeliveredAmount?.currency ||
      (typeof tx.Amount === "object" ? tx.Amount.currency : "XRP"),
    i2: meta.DeliveredAmount?.issuer || tx.Destination,
    v2: meta.DeliveredAmount
      ? typeof meta.DeliveredAmount === "string"
        ? parseFloat(meta.DeliveredAmount) / 1000000
        : meta.DeliveredAmount?.value || 0
      : typeof tx.Amount === "string"
      ? parseFloat(tx.Amount) / 1000000
      : tx.Amount?.value || 0,
  };
};

export const serializeSwapGroups = (swapGroups) => {
  return swapGroups.map((group) => ({
    asset1: {
      currency: group.asset1.currency,
      issuer: group.asset1.issuer,
    },
    asset2: {
      currency: group.asset2.currency,
      issuer: group.asset2.issuer,
    },
    swaps: group.swaps.slice(0, 100).map((swap) => ({
      // Reduced from 25 to 15 upped to 100
      h: swap.hash,
      c1: swap.c1,
      i1: swap.i1,
      v1: Math.round(swap.v1 * 1000000) / 1000000,
      c2: swap.c2,
      i2: swap.i2,
      v2: Math.round(swap.v2 * 1000000) / 1000000,
      d: swap.date,
    })),
  }));
};

export const deserializeSwapGroups = (serializedGroups) => {
  return serializedGroups.map((group) => ({
    asset1: group.asset1,
    asset2: group.asset2,
    swaps: group.swaps,
  }));
};

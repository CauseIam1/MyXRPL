import {
  determineBaseCurrency,
  asciiToHex,
  formatCurrencyCode,
} from "./pairsChart.utils";

export const generateNormalizedPairKey = (
  currency1,
  issuer1,
  currency2,
  issuer2
) => {
  const pair1 = `${currency1}-${issuer1}`;
  const pair2 = `${currency2}-${issuer2}`;
  const sortedPairs = [pair1, pair2].sort();
  return `${sortedPairs[0]}→${sortedPairs[1]}`;
};

export const fetchChartData = async (
  currency1,
  issuer1,
  currency2,
  issuer2,
  tokenPrices,
  setProgress
) => {
  try {
    const pairKey = generateNormalizedPairKey(
      currency1,
      issuer1,
      currency2,
      issuer2
    );
    const rawCacheKey = `chart_pair_data_cache_raw_${pairKey}`;
    const processedCacheKey = `chart_processed_${pairKey}`;
    const cachedProcessed = localStorage.getItem(processedCacheKey);
    if (cachedProcessed) {
      try {
        const parsed = JSON.parse(cachedProcessed);
        if (parsed.expires > Date.now()) {
          setProgress({
            message: "Loading cached chart data...",
            percent: 100,
          });
          return {
            ammData: parsed.data,
            asset1IsBase: parsed.asset1IsBase,
            fromCache: true,
          };
        } else {
          localStorage.removeItem(processedCacheKey);
        }
      } catch (e) {
        // Cache read error
      }
    }

    const cachedRaw = localStorage.getItem(rawCacheKey);
    let ammTransactions = [];
    let detectedAssetOrder = "normal";
    let lastLedgerIndex = null;

    if (cachedRaw) {
      try {
        const parsed = JSON.parse(cachedRaw);
        if (parsed.expires > Date.now()) {
          ammTransactions = parsed.data;
          detectedAssetOrder = parsed.assetOrder || "normal";
          lastLedgerIndex = parsed.lastLedgerIndex || null;
          setProgress({
            message: "Loading cached transaction data...",
            percent: 30,
          });
        } else {
          localStorage.removeItem(rawCacheKey);
          ammTransactions = [];
        }
      } catch (e) {
        // Cache read error
        ammTransactions = [];
      }
    }

    if (ammTransactions.length === 0) {
      setProgress({ message: "Searching for AMM pool...", percent: 0 });

      const poolResult = await getAmmPoolAddress(
        currency1,
        issuer1,
        currency2,
        issuer2,
        setProgress
      );

      if (!poolResult) {
        return { error: "No AMM pool found for this token pair" };
      }

      const { address: poolAddress, order: detectedOrder } = poolResult;
      detectedAssetOrder = detectedOrder;

      setProgress({ message: "Fetching AMM transactions...", percent: 30 });

      ammTransactions = await fetchTransactions(
        poolAddress,
        true,
        setProgress,
        lastLedgerIndex
      );

      try {
        const cacheData = {
          data: ammTransactions,
          assetOrder: detectedAssetOrder,
          lastLedgerIndex: getLastLedgerIndex(ammTransactions),
          timestamp: Date.now(),
          expires: Date.now() + 24 * 60 * 60 * 1000,
        };
        localStorage.setItem(rawCacheKey, JSON.stringify(cacheData));
      } catch (e) {
        // Silent cache write error
      }
    }

    setProgress({ message: "Processing AMM data...", percent: 70 });

    const asset1IsBase = determineBaseCurrency(
      { currency1, issuer1, currency2, issuer2 },
      tokenPrices
    );

    const ammData = ammTransactions
      .map((tx, index) => {
        const result = extractTransactionData(
          tx,
          currency1,
          issuer1,
          currency2,
          issuer2,
          detectedAssetOrder,
          asset1IsBase
        );
        return result;
      })
      .filter(Boolean);

    try {
      const cacheData = {
        data: ammData,
        asset1IsBase: asset1IsBase,
        timestamp: Date.now(),
        expires: Date.now() + 30 * 60 * 1000,
      };
      localStorage.setItem(processedCacheKey, JSON.stringify(cacheData));
    } catch (e) {
      // Silent cache write error
    }

    setProgress({ message: "Complete!", percent: 100 });
    return { ammData, asset1IsBase, fromCache: false };
  } catch (err) {
    return { error: err.message };
  }
};

const getLastLedgerIndex = (transactions) => {
  if (!transactions || transactions.length === 0) return null;
  const ledgerIndices = transactions
    .map((tx) => tx.tx?.ledger_index)
    .filter((index) => index !== undefined && index !== null)
    .sort((a, b) => b - a);
  return ledgerIndices.length > 0 ? ledgerIndices[0] : null;
};

export const getAmmPoolAddress = async (
  currency1,
  issuer1,
  currency2,
  issuer2,
  setProgress
) => {
  const hexCurrency1 = asciiToHex(currency1);
  const hexCurrency2 = asciiToHex(currency2);

  if (
    !isValidCurrencyCode(hexCurrency1) ||
    !isValidCurrencyCode(hexCurrency2)
  ) {
    return null;
  }
  if (hexCurrency1 !== "XRP" && (!issuer1 || !isValidXrpAddress(issuer1))) {
    return null;
  }
  if (hexCurrency2 !== "XRP" && (!issuer2 || !isValidXrpAddress(issuer2))) {
    return null;
  }

  const endpoints = [
    "wss://xrplcluster.com",
    "wss://s1.ripple.com:443",
    "wss://s2.ripple.com:51233",
  ];

  if (setProgress) {
    setProgress({
      message: `Searching for AMM pool for ${formatCurrencyCode(
        currency1
      )}/${formatCurrencyCode(currency2)}...`,
      percent: 10,
    });
  }

  const combinations = [
    {
      asset1: { currency: hexCurrency1, issuer: issuer1 },
      asset2: { currency: hexCurrency2, issuer: issuer2 },
      order: "normal",
    },
    {
      asset1: { currency: hexCurrency2, issuer: issuer2 },
      asset2: { currency: hexCurrency1, issuer: issuer1 },
      order: "reversed",
    },
  ];

  for (const endpoint of endpoints) {
    for (const combination of combinations) {
      try {
        const poolAddress = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout"));
          }, 5000);
          const ws = new WebSocket(endpoint);
          ws.onopen = () => {
            try {
              const request = {
                id: Date.now(),
                command: "amm_info",
                asset:
                  combination.asset1.currency === "XRP"
                    ? { currency: "XRP" }
                    : combination.asset1,
                asset2:
                  combination.asset2.currency === "XRP"
                    ? { currency: "XRP" }
                    : combination.asset2,
              };
              ws.send(JSON.stringify(request));
            } catch (sendError) {
              clearTimeout(timeout);
              ws.close();
              reject(sendError);
            }
          };
          ws.onmessage = (event) => {
            clearTimeout(timeout);
            try {
              const data = JSON.parse(event.data);
              ws.close();
              if (data.result && data.result.amm && data.result.amm.account) {
                resolve({
                  address: data.result.amm.account,
                  order: combination.order,
                  asset1: combination.asset1,
                  asset2: combination.asset2,
                });
              } else {
                resolve(null);
              }
            } catch (parseError) {
              ws.close();
              reject(parseError);
            }
          };
          ws.onerror = (error) => {
            clearTimeout(timeout);
            ws.close();
            reject(error);
          };
          ws.onclose = () => {
            clearTimeout(timeout);
          };
        });
        if (poolAddress) {
          return poolAddress;
        }
      } catch (error) {}
    }
  }

  return null;
};

const isValidCurrencyCode = (code) => {
  if (!code) return false;
  if (code === "XRP") return true;
  if (code.length === 3 && /^[A-Z0-9]{3}$/.test(code)) return true;
  if (code.length === 40 && /^[0-9A-F]{40}$/.test(code)) return true;
  return false;
};

const isValidXrpAddress = (address) => {
  if (!address) return false;
  return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
};

export const fetchTransactions = async (
  account,
  isAmmPool,
  setProgress,
  lastLedgerIndex = null
) => {
  const endpoints = [
    "wss://xrplcluster.com",
    "wss://s1.ripple.com:443",
    "wss://s2.ripple.com:51233",
  ];

  const ledgerIndexMin = lastLedgerIndex ? lastLedgerIndex + 1 : -1;

  for (const endpoint of endpoints) {
    try {
      const transactions = await fetchMultiplePages(
        endpoint,
        account,
        isAmmPool,
        setProgress,
        ledgerIndexMin
      );
      if (transactions && transactions.length > 0) {
        return transactions;
      }
    } catch (error) {}
  }

  return [];
};

export const fetchMultiplePages = async (
  endpoint,
  account,
  isAmmPool,
  setProgress,
  ledgerIndexMin = -1
) => {
  let allTransactions = [];
  let marker = null;
  let pagesFetched = 0;
  const maxPages = 10;

  return new Promise((resolve) => {
    const fetchAllPages = async () => {
      try {
        while (pagesFetched < maxPages) {
          const pageTransactions = await new Promise((resolvePage, reject) => {
            let timeoutId;
            const cleanup = () => {
              if (timeoutId) clearTimeout(timeoutId);
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
              }
            };
            timeoutId = setTimeout(() => {
              cleanup();
              resolvePage({ transactions: [], marker: null });
            }, 15000);

            const ws = new WebSocket(endpoint);
            ws.onopen = () => {
              try {
                const request = {
                  id: Date.now() + pagesFetched,
                  command: "account_tx",
                  account: account,
                  ledger_index_min: ledgerIndexMin,
                  ledger_index_max: -1,
                  limit: 200,
                  forward: false,
                  ...(marker ? { marker } : {}),
                };
                ws.send(JSON.stringify(request));
              } catch (sendError) {
                cleanup();
                resolvePage({ transactions: [], marker: null });
              }
            };
            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.result && data.result.transactions) {
                  let transactions = data.result.transactions;
                  cleanup();
                  resolvePage({
                    transactions: transactions,
                    marker: data.result.marker,
                  });
                } else {
                  cleanup();
                  resolvePage({ transactions: [], marker: null });
                }
              } catch (parseError) {
                cleanup();
                resolvePage({ transactions: [], marker: null });
              }
            };
            ws.onerror = (error) => {
              cleanup();
              resolvePage({ transactions: [], marker: null });
            };
            ws.onclose = () => {};
          });

          if (
            pageTransactions.transactions &&
            pageTransactions.transactions.length > 0
          ) {
            allTransactions = [
              ...allTransactions,
              ...pageTransactions.transactions,
            ];

            marker = pageTransactions.marker;
            pagesFetched++;

            const progressPercent = Math.min(
              30 + Math.floor((pagesFetched / maxPages) * 50),
              80
            );
            if (setProgress) {
              setProgress({
                message: `Fetching AMM transactions... Page ${pagesFetched} of ${maxPages}`,
                percent: progressPercent,
              });
            }

            if (!marker) {
              break;
            }

            if (pagesFetched < maxPages) {
              await new Promise((r) => setTimeout(r, 100));
            }
          } else {
            break;
          }
        }

        resolve(allTransactions);
      } catch (error) {
        resolve(allTransactions);
      }
    };

    fetchAllPages();
  });
};

export const extractTransactionData = (
  tx,
  asset1Currency,
  asset1Issuer,
  asset2Currency,
  asset2Issuer,
  assetOrder,
  isAsset1Base
) => {
  try {
    const meta = tx.meta || tx.metaData;
    if (!meta || !tx.tx) return null;

    const hexCurrency1 = asciiToHex(asset1Currency);
    const hexCurrency2 = asciiToHex(asset2Currency);

    if (tx.tx.TransactionType === "Payment") {
      const sent = tx.tx.SendMax || tx.tx.Amount;
      const delivered = meta.DeliveredAmount || tx.tx.Amount;
      let asset1Amount = 0;
      let asset2Amount = 0;
      let hasAsset1 = false;
      let hasAsset2 = false;
      let isBuyingBase = false;

      if (sent && typeof sent === "object") {
        if (sent.currency === hexCurrency1 && sent.issuer === asset1Issuer) {
          asset1Amount = parseFloat(sent.value);
          hasAsset1 = true;
        } else if (
          sent.currency === hexCurrency2 &&
          sent.issuer === asset2Issuer
        ) {
          asset2Amount = parseFloat(sent.value);
          hasAsset2 = true;
        }
      }

      if (delivered && typeof delivered === "object") {
        if (
          delivered.currency === hexCurrency1 &&
          delivered.issuer === asset1Issuer
        ) {
          asset1Amount = parseFloat(delivered.value);
          hasAsset1 = true;
        } else if (
          delivered.currency === hexCurrency2 &&
          delivered.issuer === asset2Issuer
        ) {
          asset2Amount = parseFloat(delivered.value);
          hasAsset2 = true;
        }
      }

      if (!hasAsset1 || !hasAsset2 || asset1Amount <= 0 || asset2Amount <= 0) {
        return null;
      }

      if (sent && typeof sent === "object") {
        if (sent.currency === hexCurrency1 && sent.issuer === asset1Issuer) {
          isBuyingBase = !isAsset1Base;
        } else if (
          sent.currency === hexCurrency2 &&
          sent.issuer === asset2Issuer
        ) {
          isBuyingBase = isAsset1Base;
        }
      }

      let price, volume;
      let rawPrice;

      if (assetOrder === "normal") {
        rawPrice = asset2Amount / asset1Amount;
        volume = asset1Amount;
      } else {
        rawPrice = asset1Amount / asset2Amount;
        volume = asset2Amount;
      }

      price = rawPrice >= 1 ? rawPrice : 1 / rawPrice;
      const timestamp = (tx.tx.date + 946684800) * 1000;

      if (price > 0 && isFinite(price)) {
        return {
          time: timestamp,
          value: price,
          volume: volume,
          asset1Amount: asset1Amount,
          asset2Amount: asset2Amount,
          isBuyingBase: isBuyingBase,
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const processChartData = (mergedData, asset1IsBase, timeRange) => {
  if (!mergedData || mergedData.length === 0) {
    return [];
  }

  const ranges = {
    "1H": 3600,
    "6H": 6 * 3600,
    "24H": 24 * 3600,
    "7D": 7 * 24 * 3600,
    "30D": 30 * 24 * 3600,
  };

  const now = Date.now() / 1000;
  const startTime = now - (ranges[timeRange] || ranges["30D"]);

  let recentTransactions = mergedData.filter(
    (tx) => tx.time && tx.time >= startTime * 1000 && tx.time <= now * 1000
  );

  if (recentTransactions.length === 0) {
    recentTransactions = mergedData.slice(-100);
  }

  if (recentTransactions.length === 0) {
    return [];
  }

  recentTransactions.sort((a, b) => a.time - b.time);

  const values = recentTransactions
    .map((tx) => tx.value)
    .filter((v) => v > 0 && isFinite(v));

  if (values.length === 0) return [];

  let filteredTransactions = recentTransactions;

  if (values.length > 4) {
    const sortedValues = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sortedValues.length * 0.25);
    const q3Index = Math.floor(sortedValues.length * 0.75);
    const q1 = sortedValues[q1Index];
    const q3 = sortedValues[q3Index];
    const iqr = q3 - q1;
    const lowerBound = Math.max(0, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;

    filteredTransactions = recentTransactions.filter((tx) => {
      if (!tx.value || !isFinite(tx.value)) return false;
      const isOutlier = tx.value < lowerBound || tx.value > upperBound;
      const wouldFilterTooMuch =
        filteredTransactions.length - 1 < recentTransactions.length * 0.5;
      return !isOutlier || wouldFilterTooMuch;
    });
  }

  if (
    filteredTransactions.length < Math.max(1, recentTransactions.length * 0.3)
  ) {
    filteredTransactions = recentTransactions;
  }

  const data = [];

  const interval =
    timeRange === "1H"
      ? 60 // 1 minute
      : timeRange === "6H"
      ? 300 // 5 minutes
      : timeRange === "24H"
      ? 900 // 15 minutes
      : timeRange === "7D"
      ? 3600 // 1 hour
      : 14400; // 4 hours for 30D

  const hourlyBuckets = {};
  const dataStartTime = Math.min(...filteredTransactions.map((tx) => tx.time));
  const dataEndTime = Math.max(...filteredTransactions.map((tx) => tx.time));

  for (let time = dataStartTime; time <= dataEndTime; time += interval * 1000) {
    const bucketKey = Math.floor(time / (interval * 1000)) * (interval * 1000);
    hourlyBuckets[bucketKey] = {
      transactions: [],
      totalValue: 0,
      totalVolume: 0,
      buyBaseCount: 0,
      sellBaseCount: 0,
    };
  }

  filteredTransactions.forEach((tx) => {
    if (tx.time && tx.value > 0 && isFinite(tx.value)) {
      const bucketKey =
        Math.floor(tx.time / (interval * 1000)) * (interval * 1000);
      if (hourlyBuckets[bucketKey]) {
        hourlyBuckets[bucketKey].transactions.push(tx);
        hourlyBuckets[bucketKey].totalValue += tx.value * tx.volume;
        hourlyBuckets[bucketKey].totalVolume += tx.volume;

        if (tx.isBuyingBase) {
          hourlyBuckets[bucketKey].buyBaseCount++;
        } else {
          hourlyBuckets[bucketKey].sellBaseCount++;
        }
      }
    }
  });

  Object.keys(hourlyBuckets).forEach((bucketKey) => {
    const bucket = hourlyBuckets[bucketKey];
    if (bucket.transactions.length > 0 && bucket.totalVolume > 0) {
      const avgValue = bucket.totalValue / bucket.totalVolume;
      const totalVol = bucket.totalVolume;

      const isBuyingBase = bucket.buyBaseCount >= bucket.sellBaseCount;

      if (avgValue > 0 && isFinite(avgValue)) {
        let finalPrice = avgValue;
        if (finalPrice < 1 && finalPrice > 0) {
          finalPrice = 1 / finalPrice;
        }

        if (finalPrice >= 1 && isFinite(finalPrice)) {
          data.push({
            time: parseInt(bucketKey) + (interval * 1000) / 2,
            quotePerBase: finalPrice,
            basePerQuote: finalPrice > 0 ? 1 / finalPrice : 0,
            volume: Math.round(totalVol * 1000000) / 1000000,
            isBuyingBase: isBuyingBase,
          });
        }
      }
    }
  });

  data.sort((a, b) => a.time - b.time);
  return data;
};

export const calculateStats = (data) => {
  if (!data || data.length === 0) {
    return { current: 0, high: 0, low: 0, change24h: 0, volume: 0 };
  }

  const validData = data.filter(
    (d) => d.quotePerBase >= 1 && isFinite(d.quotePerBase) && d.volume >= 0
  );

  if (validData.length === 0) {
    return { current: 0, high: 0, low: 0, change24h: 0, volume: 0 };
  }

  const values = validData.map((d) => d.quotePerBase);
  const current = validData[validData.length - 1]?.quotePerBase || 0;

  const sortedValues = [...values].sort((a, b) => a - b);
  const removeCount = Math.floor(sortedValues.length * 0.02);
  const filteredValues = sortedValues.slice(
    removeCount,
    sortedValues.length - removeCount
  );

  const high =
    filteredValues.length > 0
      ? Math.max(...filteredValues)
      : Math.max(...values);
  const low =
    filteredValues.length > 0
      ? Math.min(...filteredValues.filter((v) => v >= 1))
      : Math.min(...values.filter((v) => v >= 1));

  const now = Date.now();
  const oneDayAgo = now - 24 * 3600 * 1000;
  const dayAgoPoint = validData.find((d) => d.time >= oneDayAgo);
  const change24h =
    dayAgoPoint && dayAgoPoint.quotePerBase > 0
      ? ((current - dayAgoPoint.quotePerBase) / dayAgoPoint.quotePerBase) * 100
      : 0;

  const volume = validData.reduce((sum, d) => sum + (d.volume || 0), 0);

  return { current, high, low, change24h, volume };
};

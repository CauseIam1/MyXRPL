import { determineBaseCurrency, asciiToHex } from "./tradingChart.utils";

const CACHE_PREFIX = "chart_data_cache_";
const CACHE_DURATION = 24 * 60 * 60 * 1000;

const getCachedTransactions = (key) => {
  try {
    const cacheKey = `${CACHE_PREFIX}raw_${key}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.expires > Date.now()) {
        return parsed.data;
      }
      localStorage.removeItem(cacheKey);
    }
  } catch (e) {}
  return null;
};

const cacheTransactions = (key, data) => {
  try {
    const cacheKey = `${CACHE_PREFIX}raw_${key}`;
    const cacheData = {
      data,
      timestamp: Date.now(),
      expires: Date.now() + CACHE_DURATION,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (e) {}
};

export const loadPairChartData = async (
  selectedPair,
  tokenPrices,
  setProgress
) => {
  try {
    const pairKey = `${selectedPair.currency1}-${selectedPair.issuer1}→${selectedPair.currency2}-${selectedPair.issuer2}`;
    const cached = getCachedTransactions(`pair_${pairKey}`);

    if (cached) {
      return { chartData: cached };
    }

    setProgress({ message: "Searching for AMM pool...", percent: 10 });

    const poolResult = await getAmmPoolAddress(
      selectedPair.currency1,
      selectedPair.issuer1,
      selectedPair.currency2,
      selectedPair.issuer2
    );

    if (!poolResult) {
      return { error: "No AMM pool found for this token pair" };
    }

    const { address: poolAddress, order: detectedAssetOrder } = poolResult;

    setProgress({ message: "Fetching AMM transactions...", percent: 30 });

    const ammTransactions = await fetchTransactions(poolAddress, true);

    setProgress({ message: "Processing AMM data...", percent: 70 });

    const asset1IsBase = determineBaseCurrency(selectedPair, tokenPrices);

    const ammData = ammTransactions
      .map((tx, index) => {
        const result = extractPairTransactionData(
          tx,
          selectedPair.currency1,
          selectedPair.issuer1,
          selectedPair.currency2,
          selectedPair.issuer2,
          detectedAssetOrder,
          asset1IsBase
        );
        return result;
      })
      .filter(Boolean);

    cacheTransactions(`pair_${pairKey}`, ammData);

    return { chartData: ammData };
  } catch (err) {
    return { error: err.message };
  }
};

export const loadTokenChartData = async (selectedToken, setProgress) => {
  try {
    const tokenKey = `${selectedToken.currency}-${selectedToken.issuer}`;
    const cached = getCachedTransactions(`token_${tokenKey}`);

    if (cached) {
      return { chartData: cached };
    }

    setProgress({ message: "Searching for AMM pool...", percent: 10 });

    const poolAddress = await getAmmPoolAddress(
      selectedToken.currency,
      selectedToken.issuer
    );

    setProgress({ message: "Fetching AMM transactions...", percent: 20 });
    let ammTransactions = [];
    if (poolAddress) {
      ammTransactions = await fetchTransactions(
        poolAddress,
        true,
        selectedToken.currency,
        selectedToken.issuer
      );
    }

    setProgress({ message: "Fetching DEX transactions...", percent: 50 });
    const dexTransactions = await fetchTransactions(
      selectedToken.issuer,
      false,
      selectedToken.currency,
      selectedToken.issuer
    );

    setProgress({ message: "Processing transaction data...", percent: 70 });

    const ammData = ammTransactions
      .map((tx) =>
        extractTokenTransactionData(
          tx,
          selectedToken.currency,
          selectedToken.issuer
        )
      )
      .filter(Boolean);

    const dexData = dexTransactions
      .map((tx) =>
        extractTokenTransactionData(
          tx,
          selectedToken.currency,
          selectedToken.issuer
        )
      )
      .filter(Boolean);

    const combinedData = [...ammData, ...dexData];

    cacheTransactions(`token_${tokenKey}`, combinedData);

    return { chartData: combinedData };
  } catch (err) {
    return { error: err.message };
  }
};

export const getAmmPoolAddress = async (
  currency1,
  issuer1,
  currency2,
  issuer2
) => {
  const hexCurrency1 =
    currency1.length <= 3 ? currency1 : asciiToHex(currency1);
  const hexCurrency2 =
    currency2?.length <= 3 ? currency2 : asciiToHex(currency2);

  const endpoints = [
    "wss://xrplcluster.com",
    "wss://s1.ripple.com:443",
    "wss://s2.ripple.com:51233",
  ];

  const combinations = currency2
    ? [
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
      ]
    : [
        {
          asset1: { currency: "XRP" },
          asset2: { currency: hexCurrency1, issuer: issuer1 },
          order: "normal",
        },
      ];

  for (const endpoint of endpoints) {
    for (const combination of combinations) {
      try {
        const poolAddress = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
          const ws = new WebSocket(endpoint);

          ws.onopen = () => {
            const asset1Param =
              combination.asset1.currency === "XRP"
                ? { currency: "XRP" }
                : combination.asset1;
            const asset2Param =
              combination.asset2.currency === "XRP"
                ? { currency: "XRP" }
                : combination.asset2;

            ws.send(
              JSON.stringify({
                id: Date.now(),
                command: "amm_info",
                asset: asset1Param,
                asset2: asset2Param,
              })
            );
          };

          ws.onmessage = (event) => {
            clearTimeout(timeout);
            const data = JSON.parse(event.data);
            ws.close();

            if (data.result?.amm?.account) {
              resolve({
                address: data.result.amm.account,
                order: combination.order,
              });
            } else {
              resolve(null);
            }
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          };
        });

        if (poolAddress) return poolAddress;
      } catch (error) {}
    }
  }

  return null;
};

export const fetchTransactions = async (
  account,
  isAmmPool,
  targetCurrency,
  targetIssuer
) => {
  const endpoints = [
    "wss://xrplcluster.com",
    "wss://s1.ripple.com:443",
    "wss://s2.ripple.com:51233",
  ];

  for (const endpoint of endpoints) {
    try {
      const transactions = await fetchMultiplePages(
        endpoint,
        account,
        isAmmPool,
        targetCurrency,
        targetIssuer
      );
      if (transactions.length > 0) return transactions;
    } catch (error) {}
  }
  return [];
};

export const fetchMultiplePages = async (
  endpoint,
  account,
  isAmmPool,
  targetCurrency,
  targetIssuer
) => {
  let allTransactions = [];
  let marker = null;
  let pagesFetched = 0;
  const maxPages = 15;
  const hexCurrency = targetCurrency ? asciiToHex(targetCurrency) : null;

  do {
    try {
      const pageTransactions = await new Promise((resolve) => {
        let timeoutId;
        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (ws?.readyState === WebSocket.OPEN) ws.close();
        };

        timeoutId = setTimeout(() => {
          cleanup();
          resolve([]);
        }, 10000);
        const ws = new WebSocket(endpoint);

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              id: Date.now() + pagesFetched,
              command: "account_tx",
              account,
              ledger_index_min: -1,
              ledger_index_max: -1,
              limit: 100,
              forward: false,
              ...(marker ? { marker } : {}),
            })
          );
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.result?.transactions) {
            let txs = data.result.transactions;

            if (targetCurrency && targetIssuer) {
              txs = txs.filter((tx) => {
                const meta = tx.meta || tx.metaData;
                if (!meta || !tx.tx) return false;

                const sent = tx.tx.SendMax || tx.tx.Amount;
                const delivered = meta.DeliveredAmount || tx.tx.Amount;

                const checkAsset = (asset) => {
                  if (asset && typeof asset === "object") {
                    if (targetCurrency.length <= 3) {
                      return (
                        asset.currency === targetCurrency &&
                        asset.issuer === targetIssuer
                      );
                    } else {
                      return (
                        asset.currency === hexCurrency &&
                        asset.issuer === targetIssuer
                      );
                    }
                  }
                  return false;
                };

                return checkAsset(sent) || checkAsset(delivered);
              });
            }

            cleanup();
            resolve({ transactions: txs, marker: data.result.marker });
          } else {
            cleanup();
            resolve({ transactions: [], marker: null });
          }
        };

        ws.onerror = () => cleanup();
      });

      if (pageTransactions.transactions.length > 0) {
        allTransactions = [
          ...allTransactions,
          ...pageTransactions.transactions,
        ];
        marker = pageTransactions.marker;
        pagesFetched++;

        if (!marker || pagesFetched >= maxPages) break;
        await new Promise((r) => setTimeout(r, 200));
      } else {
        break;
      }
    } catch (error) {
      break;
    }
  } while (marker && pagesFetched < maxPages);

  return allTransactions;
};

export const extractPairTransactionData = (
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
    if (!meta || !tx.tx) {
      return null;
    }

    if (
      tx.tx.TransactionType !== "Payment" ||
      meta.TransactionResult !== "tesSUCCESS"
    ) {
      return null;
    }

    const hexCurrency1 = asciiToHex(asset1Currency);
    const hexCurrency2 = asciiToHex(asset2Currency);

    const parseAmount = (amount) => {
      if (!amount) return null;

      if (typeof amount === "string") {
        const value = parseFloat(amount) / 1000000;
        return { currency: "XRP", issuer: null, value: value };
      } else if (
        typeof amount === "object" &&
        amount.currency &&
        amount.value !== undefined
      ) {
        const value = parseFloat(amount.value);
        return {
          currency: amount.currency,
          issuer: amount.issuer || null,
          value: value,
        };
      }
      return null;
    };

    const deliveredAmount =
      meta.delivered_amount || meta.DeliveredAmount || tx.tx.Amount;
    const sentAmount = tx.tx.Amount;

    const delivered = parseAmount(deliveredAmount);
    const sent = parseAmount(sentAmount);

    if (!delivered || !sent) {
      return null;
    }

    const isAsset1Currency = (currency) => {
      return (
        currency === asset1Currency ||
        currency === hexCurrency1 ||
        (asset1Currency === "XRP" && currency === "XRP")
      );
    };

    const isAsset2Currency = (currency) => {
      return (
        currency === asset2Currency ||
        currency === hexCurrency2 ||
        (asset2Currency === "XRP" && currency === "XRP")
      );
    };

    const isAsset1Issuer = (issuer) => {
      return asset1Currency === "XRP"
        ? issuer === null
        : issuer === asset1Issuer;
    };

    const isAsset2Issuer = (issuer) => {
      return asset2Currency === "XRP"
        ? issuer === null
        : issuer === asset2Issuer;
    };

    let asset1Sent = 0,
      asset2Sent = 0;
    let asset1Received = 0,
      asset2Received = 0;

    if (isAsset1Currency(sent.currency) && isAsset1Issuer(sent.issuer)) {
      asset1Sent = sent.value;
    } else if (isAsset2Currency(sent.currency) && isAsset2Issuer(sent.issuer)) {
      asset2Sent = sent.value;
    }

    if (
      isAsset1Currency(delivered.currency) &&
      isAsset1Issuer(delivered.issuer)
    ) {
      asset1Received = delivered.value;
    } else if (
      isAsset2Currency(delivered.currency) &&
      isAsset2Issuer(delivered.issuer)
    ) {
      asset2Received = delivered.value;
    }

    if (meta.AffectedNodes) {
      meta.AffectedNodes.forEach((node) => {
        const modifiedNode =
          node.ModifiedNode || node.DeletedNode || node.CreatedNode;
        if (modifiedNode && modifiedNode.LedgerEntryType === "RippleState") {
          const finalFields = modifiedNode.FinalFields || {};
          const previousFields = modifiedNode.PreviousFields || {};
          if (finalFields.Balance && finalFields.Balance.currency) {
            const currency = finalFields.Balance.currency;
            const issuer =
              finalFields.LowLimit?.issuer || finalFields.HighLimit?.issuer;
            const finalValue = parseFloat(finalFields.Balance.value || "0");
            const previousValue = parseFloat(
              previousFields.Balance?.value || finalValue.toString()
            );
            const delta = finalValue - previousValue;

            if (isAsset1Currency(currency) && isAsset1Issuer(issuer)) {
              if (delta > 0) {
                asset1Received += delta;
              } else {
                asset1Sent += Math.abs(delta);
              }
            } else if (isAsset2Currency(currency) && isAsset2Issuer(issuer)) {
              if (delta > 0) {
                asset2Received += delta;
              } else {
                asset2Sent += Math.abs(delta);
              }
            }
          }
        }
      });
    }

    let baseAmount = 0,
      quoteAmount = 0;

    if (asset1Sent > 0.000001 && asset2Received > 0.000001) {
      if (isAsset1Base) {
        baseAmount = asset1Sent;
        quoteAmount = asset2Received;
      } else {
        baseAmount = asset2Received;
        quoteAmount = asset1Sent;
      }
    } else if (asset2Sent > 0.000001 && asset1Received > 0.000001) {
      if (isAsset1Base) {
        baseAmount = asset1Received;
        quoteAmount = asset2Sent;
      } else {
        baseAmount = asset2Sent;
        quoteAmount = asset1Received;
      }
    } else if (
      (asset1Received > 0.000001 || asset1Sent > 0.000001) &&
      (asset2Received > 0.000001 || asset2Sent > 0.000001)
    ) {
      const netAsset1 = Math.abs(asset1Received - asset1Sent);
      const netAsset2 = Math.abs(asset2Received - asset2Sent);

      if (netAsset1 > 0.000001 && netAsset2 > 0.000001) {
        if (asset1Sent > asset1Received && asset2Received > asset2Sent) {
          if (isAsset1Base) {
            baseAmount = netAsset1;
            quoteAmount = netAsset2;
          } else {
            baseAmount = netAsset2;
            quoteAmount = netAsset1;
          }
        } else if (asset2Sent > asset2Received && asset1Received > asset1Sent) {
          if (isAsset1Base) {
            baseAmount = netAsset1;
            quoteAmount = netAsset2;
          } else {
            baseAmount = netAsset2;
            quoteAmount = netAsset1;
          }
        }
      }
    }

    if (baseAmount <= 0 || quoteAmount <= 0) {
      return null;
    }

    let price;
    if (isAsset1Base) {
      price = quoteAmount / baseAmount;
    } else {
      price = baseAmount / quoteAmount;
    }

    if (price > 0 && price < 1) {
      price = 1 / price;
      isAsset1Base = !isAsset1Base;
      [baseAmount, quoteAmount] = [quoteAmount, baseAmount];
    }

    if (price <= 0 || !isFinite(price) || price > 1e20) {
      return null;
    }

    if (price < 1) {
      return null;
    }

    const timestamp = tx.tx.date + 946684800;

    if (isAsset1Base) {
      return {
        quotePerBase: price,
        basePerQuote: price > 0 ? 1 / price : 0,
        volume: quoteAmount,
        quoteVolume: quoteAmount,
        baseVolume: baseAmount,
        timestamp,
      };
    } else {
      return {
        quotePerBase: price,
        basePerQuote: price > 0 ? 1 / price : 0,
        volume: quoteAmount,
        quoteVolume: quoteAmount,
        baseVolume: baseAmount,
        timestamp,
      };
    }
  } catch (e) {
    return null;
  }
};

export const extractTokenTransactionData = (
  tx,
  targetCurrency,
  targetIssuer
) => {
  try {
    const meta = tx.meta || tx.metaData;
    if (!meta || !tx.tx) {
      return null;
    }

    const hexCurrency = asciiToHex(targetCurrency);

    if (tx.tx.TransactionType === "Payment") {
      const sent = tx.tx.SendMax || tx.tx.Amount;
      const delivered = meta.DeliveredAmount || tx.tx.Amount;
      let xrpAmount = 0;
      let tokenAmount = 0;
      const sentIsXrp = typeof sent === "string";
      const deliveredIsXrp = typeof delivered === "string";
      const sentIsTargetToken =
        sent &&
        typeof sent === "object" &&
        ((targetCurrency.length <= 3 &&
          sent.currency === targetCurrency &&
          sent.issuer === targetIssuer) ||
          (targetCurrency.length > 3 &&
            sent.currency === hexCurrency &&
            sent.issuer === targetIssuer));
      const deliveredIsTargetToken =
        delivered &&
        typeof delivered === "object" &&
        ((targetCurrency.length <= 3 &&
          delivered.currency === targetCurrency &&
          delivered.issuer === targetIssuer) ||
          (targetCurrency.length > 3 &&
            delivered.currency === hexCurrency &&
            delivered.issuer === targetIssuer));

      if (sentIsXrp && deliveredIsTargetToken) {
        xrpAmount = parseFloat(sent) / 1000000;
        tokenAmount = parseFloat(delivered.value);
      } else if (sentIsTargetToken && deliveredIsXrp) {
        tokenAmount = parseFloat(sent.value);
        xrpAmount = parseFloat(delivered) / 1000000;
      } else {
        return null;
      }

      const MIN_XRP_AMOUNT = 0.000001;
      const MIN_TOKEN_AMOUNT = 0.000001;
      if (
        xrpAmount <= 0 ||
        tokenAmount <= 0 ||
        xrpAmount < MIN_XRP_AMOUNT ||
        tokenAmount < MIN_TOKEN_AMOUNT
      ) {
        return null;
      }

      const tokensPerXrp = tokenAmount / xrpAmount;
      const volume = xrpAmount;
      const assetVolume = tokenAmount;
      const timestamp = tx.tx.date + 946684800;

      if (
        tokensPerXrp > 0 &&
        tokensPerXrp < 1e12 &&
        isFinite(tokensPerXrp) &&
        assetVolume > 0 &&
        volume > 0
      ) {
        const result = {
          tokensPerXrp,
          volume,
          assetVolume,
          timestamp,
        };
        return result;
      } else {
        return null;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const processChartData = (mergedData, timeRange, isPairChart) => {
  if (!mergedData || mergedData.length === 0) {
    return [];
  }

  const now = Math.floor(Date.now() / 1000);

  const ranges = {
    "1H": 3600,
    "6H": 6 * 3600,
    "24H": 24 * 3600,
    "7D": 7 * 24 * 3600,
    "30D": 30 * 24 * 3600,
  };

  const startTime = now - ranges[timeRange];

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

  let recentTransactions = mergedData.filter(
    (tx) => tx.timestamp && tx.timestamp >= startTime && tx.timestamp <= now
  );

  if (recentTransactions.length === 0) {
    recentTransactions = mergedData.slice(-100);
  }

  recentTransactions.sort((a, b) => a.timestamp - b.timestamp);

  if (recentTransactions.length > 10) {
    const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
    const prices = recentTransactions.map((tx) => tx[priceKey]);
    const sortedPrices = [...prices].sort((a, b) => a - b);

    const q1Index = Math.floor(sortedPrices.length * 0.25);
    const q3Index = Math.floor(sortedPrices.length * 0.75);
    const q1 = sortedPrices[q1Index];
    const q3 = sortedPrices[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    recentTransactions = recentTransactions.filter((tx) => {
      return (
        tx[priceKey] >= Math.max(0, lowerBound * 0.5) &&
        tx[priceKey] <= upperBound * 2
      );
    });
  }

  const buckets = {};
  for (let time = startTime; time <= now; time += interval) {
    buckets[Math.floor(time / interval)] = {
      transactions: [],
      totalXrp: 0,
      totalTokens: 0,
      assetVolume: 0,
      xrpVolume: 0,
      high: 0,
      low: Infinity,
      open: null,
      close: null,
    };
  }

  recentTransactions.forEach((tx) => {
    const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
    const volumeKey = isPairChart ? "volume" : "volume";
    const assetVolumeKey = isPairChart ? "baseVolume" : "assetVolume";

    if (
      tx.timestamp &&
      tx[priceKey] > 0 &&
      isFinite(tx[priceKey]) &&
      (tx[volumeKey] > 0 || tx[assetVolumeKey] > 0)
    ) {
      const bucketKey = Math.floor(tx.timestamp / interval);
      if (buckets[bucketKey]) {
        const bucket = buckets[bucketKey];
        bucket.transactions.push(tx);

        if (isPairChart) {
          bucket.totalXrp += tx.baseVolume || 0;
          bucket.totalTokens += tx.quoteVolume || 0;
          bucket.xrpVolume += tx.baseVolume || 0;
          bucket.assetVolume += tx.quoteVolume || 0;
          bucket.totalXrp += tx.volume || 0;
          bucket.totalTokens += tx.assetVolume || 0;
          bucket.xrpVolume += tx.volume || 0;
          bucket.assetVolume += tx.assetVolume || 0;
        }

        bucket.high = Math.max(bucket.high, tx[priceKey]);
        bucket.low = Math.min(
          bucket.low === Infinity ? tx[priceKey] : bucket.low,
          tx[priceKey]
        );
        if (bucket.open === null) bucket.open = tx[priceKey];
        bucket.close = tx[priceKey];
      }
    }
  });

  const data = Object.keys(buckets)
    .map((key) => {
      const bucket = buckets[key];
      if (bucket.transactions.length > 0) {
        const weightedPrice = bucket.totalTokens / bucket.totalXrp;
        const safePrice =
          weightedPrice > 0 && isFinite(weightedPrice)
            ? weightedPrice
            : bucket.close || bucket.open || 0;

        if (safePrice <= 0) {
          return null;
        }

        let finalPrice = safePrice;
        if (isPairChart && finalPrice < 1) {
          finalPrice = 1 / finalPrice;
        }

        const result = {
          time: parseInt(key) * interval * 1000,
          quotePerBase: isPairChart ? finalPrice : undefined,
          tokensPerXrp: isPairChart ? undefined : finalPrice,
          volume: isPairChart ? bucket.assetVolume : bucket.assetVolume,
          assetVolume: bucket.assetVolume,
          xrpVolume: bucket.xrpVolume,
          high: bucket.high > 0 ? bucket.high : finalPrice,
          low:
            bucket.low === Infinity || bucket.low <= 0
              ? finalPrice
              : bucket.low,
          open: bucket.open || finalPrice,
          close: bucket.close || finalPrice,
        };

        return result;
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  return data;
};

export const calculateStats = (data, isPairChart) => {
  if (!data || data.length === 0) {
    return { current: 0, high: 0, low: 0, change24h: 0, volume: 0 };
  }

  const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";

  const validData = data.filter(
    (d) => d[priceKey] > 0 && isFinite(d[priceKey]) && d.volume >= 0
  );

  if (validData.length === 0) {
    return { current: 0, high: 0, low: 0, change24h: 0, volume: 0 };
  }

  const values = validData.map((d) => d[priceKey]);
  const current = validData[validData.length - 1]?.[priceKey] || 0;

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
      ? Math.min(...filteredValues.filter((v) => v > 0))
      : Math.min(...values.filter((v) => v > 0));

  const now = Date.now();
  const oneDayAgo = now - 24 * 3600 * 1000;
  const dayAgoPoint = validData.find((d) => d.time >= oneDayAgo);
  const change24h =
    dayAgoPoint && dayAgoPoint[priceKey] > 0
      ? ((current - dayAgoPoint[priceKey]) / dayAgoPoint[priceKey]) * 100
      : 0;
  const volume = validData.reduce((sum, d) => sum + (d.volume || 0), 0);

  return { current, high, low, change24h, volume };
};

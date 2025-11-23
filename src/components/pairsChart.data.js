import {
  determineBaseCurrency,
  asciiToHex,
  formatCurrencyCode,
} from "./pairsChart.utils";
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours instead of 24
const PROCESSED_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
class WebSocketPool {
  constructor(maxConnections = 3) {
    this.maxConnections = maxConnections;
    this.activeConnections = 0;
    this.waitingQueue = [];
  }
  async getConnection(endpoint) {
    return new Promise((resolve, reject) => {
      const tryConnect = () => {
        if (this.activeConnections < this.maxConnections) {
          this.activeConnections++;
          try {
            const ws = new WebSocket(endpoint);
            const originalClose = ws.close.bind(ws);
            ws.close = (...args) => {
              this.releaseConnection();
              return originalClose(...args);
            };
            ws.addEventListener("error", () => {
              this.releaseConnection();
            });
            ws.addEventListener("close", () => {
              this.releaseConnection();
            });
            resolve(ws);
          } catch (error) {
            this.releaseConnection();
            reject(error);
          }
        } else {
          this.waitingQueue.push({ resolve, reject, endpoint, tryConnect });
        }
      };
      tryConnect();
    });
  }

  releaseConnection() {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    if (
      this.waitingQueue.length > 0 &&
      this.activeConnections < this.maxConnections
    ) {
      const nextRequest = this.waitingQueue.shift();
      setTimeout(() => nextRequest.tryConnect(), 10);
    }
  }
  getActiveConnectionCount() {
    return this.activeConnections;
  }
  getWaitingQueueLength() {
    return this.waitingQueue.length;
  }
}

const wsPool = new WebSocketPool(3);

const isQuotaExceededError = (err) => {
  return (
    err instanceof DOMException &&
    (err.code === 22 ||
      err.code === 1014 ||
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
};

const cleanupCacheAggressively = () => {
  try {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("chart_")) {
        try {
          const cachedData = JSON.parse(localStorage.getItem(key));
          if (cachedData.timestamp < oneWeekAgo) {
            keysToRemove.push(key);
          }
        } catch (parseError) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn("Cache cleanup error:", error);
  }
};

const getCachedTransactions = (key, isProcessed = false) => {
  try {
    const cacheKey = `chart_data_cache_${
      isProcessed ? "processed_" : "raw_"
    }${key}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const expiration = isProcessed
        ? PROCESSED_CACHE_DURATION
        : CACHE_DURATION;
      if (parsed.expires > Date.now()) {
        if (!isProcessed && parsed.data && parsed.data.length > 1000) {
          parsed.data = parsed.data.slice(0, 1000); // Limit to 1000 transactions
        }
        return parsed.data;
      }
      localStorage.removeItem(cacheKey);
    }
  } catch (e) {}
  return null;
};

const cacheTransactions = (key, data, isProcessed = false) => {
  try {
    let dataToCache = data;
    if (!isProcessed && data && data.length > 1000) {
      dataToCache = data.slice(0, 1000); // Limit raw data to 1000 items
    } else if (isProcessed && data && data.length > 500) {
      dataToCache = data.slice(0, 500); // Limit processed data to 500 items
    }
    const cacheKey = `chart_data_cache_${
      isProcessed ? "processed_" : "raw_"
    }${key}`;
    const expiration = isProcessed ? PROCESSED_CACHE_DURATION : CACHE_DURATION;
    const cacheData = {
      data: dataToCache,
      timestamp: Date.now(),
      expires: Date.now() + expiration,
    };
    const cacheSize = JSON.stringify(cacheData).length;
    if (cacheSize > 2 * 1024 * 1024) {
      console.warn("Cache entry too large, not caching:", cacheSize);
      return;
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (e) {
    if (isQuotaExceededError(e)) {
      console.warn("LocalStorage quota exceeded, cleaning up...");
      cleanupCacheAggressively();
    }
  }
};

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
        localStorage.removeItem(processedCacheKey);
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
          ammTransactions = Array.isArray(parsed.data)
            ? parsed.data.slice(0, 1000)
            : [];
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
        localStorage.removeItem(rawCacheKey);
        ammTransactions = [];
      }
    }
    if (ammTransactions.length === 0) {
      setProgress({ message: "Searching for AMM pool...", percent: 0 });
      const poolResult = await getAmmPoolAddress(
        currency1,
        issuer1,
        currency2,
        issuer2
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
      if (ammTransactions && ammTransactions.length > 0) {
        const limitedTransactions = ammTransactions.slice(0, 500);
        try {
          const cacheData = {
            data: limitedTransactions,
            assetOrder: detectedAssetOrder,
            lastLedgerIndex: getLastLedgerIndex(limitedTransactions),
            timestamp: Date.now(),
            expires: Date.now() + 6 * 60 * 60 * 1000, // 6 hours instead of 24
          };
          const cacheSize = JSON.stringify(cacheData).length;
          if (cacheSize < 1024 * 1024) {
            localStorage.setItem(rawCacheKey, JSON.stringify(cacheData));
          }
        } catch (e) {
          if (e.name === "QuotaExceededError") {
            cleanupOldCacheEntries();
            try {
              localStorage.setItem(
                rawCacheKey,
                JSON.stringify({
                  data: limitedTransactions.slice(0, 200),
                  assetOrder: detectedAssetOrder,
                  lastLedgerIndex: getLastLedgerIndex(limitedTransactions),
                  timestamp: Date.now(),
                  expires: Date.now() + 60 * 60 * 1000, // 1 hour for fallback
                })
              );
            } catch (e2) {}
          }
        }
      }
    }
    setProgress({ message: "Processing AMM data...", percent: 70 });
    const asset1IsBase = determineBaseCurrency(
      { currency1, issuer1, currency2, issuer2 },
      tokenPrices
    );
    const limitedTransactions = ammTransactions.slice(0, 500);
    const ammData = limitedTransactions
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
        expires: Date.now() + 30 * 60 * 1000, // 30 minutes
      };
      const cacheSize = JSON.stringify(cacheData).length;
      if (cacheSize < 512 * 1024) {
        // Limit to 512KB
        localStorage.setItem(processedCacheKey, JSON.stringify(cacheData));
      }
    } catch (e) {
      if (e.name === "QuotaExceededError") {
        cleanupOldCacheEntries();
      }
    }
    setProgress({ message: "Complete!", percent: 100 });
    return { ammData, asset1IsBase, fromCache: false };
  } catch (err) {
    return { error: err.message };
  }
};

const cleanupOldCacheEntries = () => {
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("chart_")) {
        try {
          const item = localStorage.getItem(key);
          const data = JSON.parse(item);
          if (data.timestamp < oneHourAgo || data.expires < Date.now()) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (e) {}
};

const getLastLedgerIndex = (transactions) => {
  if (!transactions || transactions.length === 0) return null;
  const ledgerIndices = transactions
    .map((tx) => tx.tx?.ledger_index)
    .filter(
      (index) =>
        index !== undefined && index !== null && typeof index === "number"
    )
    .sort((a, b) => b - a);
  return ledgerIndices.length > 0 ? ledgerIndices[0] : null;
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
    "wss://s2.ripple.com:51233",
    "wss://xrpl.ws",
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
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout connecting to ${endpoint}`));
          }, 4000);
          let ws;
          wsPool
            .getConnection(endpoint)
            .then((websocket) => {
              ws = websocket;
              ws.onopen = () => {
                try {
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
                      fee_mult_max: 10000, // Add fee multiplier to prevent hanging
                    })
                  );
                } catch (sendError) {
                  clearTimeout(timeout);
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                  }
                  reject(sendError);
                }
              };
              ws.onmessage = (event) => {
                clearTimeout(timeout);
                try {
                  const data = JSON.parse(event.data);
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                  }
                  if (data.result?.amm?.account) {
                    resolve({
                      address: data.result.amm.account,
                      order: combination.order,
                    });
                  } else {
                    resolve(null);
                  }
                } catch (parseError) {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                  }
                  reject(parseError);
                }
              };
              ws.onerror = (error) => {
                clearTimeout(timeout);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.close();
                }
                reject(
                  new Error(`WebSocket error on ${endpoint}: ${error.message}`)
                );
              };
              ws.onclose = () => {
                clearTimeout(timeout);
              };
            })
            .catch((connectionError) => {
              clearTimeout(timeout);
              reject(new Error(`Failed to create WebSocket to ${endpoint}`));
            });
        });
        if (poolAddress) {
          return poolAddress;
        }
      } catch (error) {
        console.warn(
          `Failed to connect to ${endpoint} for combination:`,
          error.message
        );
      }
    }
  }
  console.warn("Failed to find AMM pool on any endpoint");
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
  if (!account || !isValidXrpAddress(account)) {
    return [];
  }
  const endpoints = [
    "wss://xrplcluster.com",
    "wss://s2.ripple.com:51233",
    "wss://s1.ripple.com:443",
    "wss://xrpl.ws",
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
    } catch (error) {
      console.warn(
        "Error fetching transactions from endpoint:",
        endpoint,
        error
      );
    }
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
  if (!account || !endpoint) {
    return [];
  }
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
            let ws = null;
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
            wsPool
              .getConnection(endpoint)
              .then((websocket) => {
                ws = websocket;
                ws.onopen = () => {
                  try {
                    const request = {
                      id: Date.now() + pagesFetched,
                      command: "account_tx",
                      account: account,
                      ledger_index_min: ledgerIndexMin,
                      ledger_index_max: -1,
                      limit: 100, // Reduced limit for faster responses
                      forward: false,
                      ...(marker ? { marker } : {}),
                      fee_mult_max: 10000, // Prevent hanging requests
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
                      let transactions = Array.isArray(data.result.transactions)
                        ? data.result.transactions
                        : [];
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
                    console.warn("Error parsing transaction data:", parseError);
                    cleanup();
                    resolvePage({ transactions: [], marker: null });
                  }
                };
                ws.onerror = (error) => {
                  console.warn("WebSocket error:", error);
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.close();
                  }
                  cleanup();
                  resolvePage({ transactions: [], marker: null });
                };
                ws.onclose = () => {
                  cleanup();
                };
              })
              .catch((connectionError) => {
                console.warn(
                  `Failed to create WebSocket connection to ${endpoint}:`,
                  connectionError.message
                );
                cleanup();
                resolvePage({ transactions: [], marker: null });
              });
          });
          if (
            pageTransactions.transactions &&
            Array.isArray(pageTransactions.transactions) &&
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
        console.error("Error in fetchAllPages:", error);
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
    if (!tx || !tx.tx || !tx.meta) {
      return null;
    }
    const meta = tx.meta || tx.metaData;
    if (!meta) return null;
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
      if (sent && typeof sent === "object" && sent.currency && sent.value) {
        if (sent.currency === hexCurrency1 && sent.issuer === asset1Issuer) {
          const value = parseFloat(sent.value);
          if (!isNaN(value) && value > 0) {
            asset1Amount = value;
            hasAsset1 = true;
          }
        } else if (
          sent.currency === hexCurrency2 &&
          sent.issuer === asset2Issuer
        ) {
          const value = parseFloat(sent.value);
          if (!isNaN(value) && value > 0) {
            asset2Amount = value;
            hasAsset2 = true;
          }
        }
      }
      if (
        delivered &&
        typeof delivered === "object" &&
        delivered.currency &&
        delivered.value
      ) {
        if (
          delivered.currency === hexCurrency1 &&
          delivered.issuer === asset1Issuer
        ) {
          const value = parseFloat(delivered.value);
          if (!isNaN(value) && value > 0) {
            asset1Amount = value;
            hasAsset1 = true;
          }
        } else if (
          delivered.currency === hexCurrency2 &&
          delivered.issuer === asset2Issuer
        ) {
          const value = parseFloat(delivered.value);
          if (!isNaN(value) && value > 0) {
            asset2Amount = value;
            hasAsset2 = true;
          }
        }
      }
      if (!hasAsset1 || !hasAsset2 || asset1Amount <= 0 || asset2Amount <= 0) {
        return null;
      }
      if (sent && typeof sent === "object" && sent.currency && sent.issuer) {
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
      if (!isFinite(rawPrice) || rawPrice <= 0) {
        return null;
      }
      price = rawPrice >= 1 ? rawPrice : rawPrice > 0 ? 1 / rawPrice : 0;
      const timestamp = (tx.tx.date + 946684800) * 1000;
      if (price > 0 && isFinite(price) && volume > 0) {
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
    console.warn("Error in extractTransactionData:", e);
    return null;
  }
};

export const processChartData = (mergedData, asset1IsBase, timeRange) => {
  if (!Array.isArray(mergedData) || mergedData.length === 0) {
    return [];
  }
  const validTimeRanges = ["1H", "6H", "24H", "7D", "30D", "ALL"];
  if (timeRange && !validTimeRanges.includes(timeRange)) {
    timeRange = "30D";
  }
  const ranges = {
    "1H": 3600,
    "6H": 6 * 3600,
    "24H": 24 * 3600,
    "7D": 7 * 24 * 3600,
    "30D": 30 * 24 * 3600,
  };
  const now = Date.now() / 1000;
  const startTime =
    timeRange === "ALL" ? 0 : now - (ranges[timeRange] || ranges["30D"]);
  let recentTransactions = mergedData.filter(
    (tx) =>
      tx && tx.time && tx.time >= startTime * 1000 && tx.time <= now * 1000
  );
  if (recentTransactions.length === 0 && timeRange !== "ALL") {
    recentTransactions = mergedData.filter((tx) => tx && tx.time).slice(-100);
  }
  if (recentTransactions.length === 0) {
    return [];
  }
  recentTransactions.sort((a, b) => {
    const timeA = a.time || 0;
    const timeB = b.time || 0;
    return timeA - timeB;
  });
  const values = recentTransactions
    .map((tx) => tx.value)
    .filter((v) => v && v > 0 && isFinite(v));

  if (values.length === 0) return [];
  let filteredTransactions = recentTransactions;
  if (values.length > 4) {
    const sortedValues = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sortedValues.length * 0.25);
    const q3Index = Math.floor(sortedValues.length * 0.75);
    const q1 = sortedValues[q1Index] || 0;
    const q3 = sortedValues[q3Index] || 0;
    const iqr = q3 - q1;
    const lowerBound = iqr > 0 ? Math.max(0, q1 - 1.5 * iqr) : 0;
    const upperBound = iqr > 0 ? q3 + 1.5 * iqr : q3 * 2;
    filteredTransactions = recentTransactions.filter((tx) => {
      if (!tx.value || !isFinite(tx.value)) return false;
      const isOutlier = tx.value < lowerBound || tx.value > upperBound;
      const wouldFilterTooMuch =
        filteredTransactions.length - 1 <
        Math.max(1, recentTransactions.length * 0.5);
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
      : 14400; // 4 hours for 30D or ALL
  const hourlyBuckets = {};
  const validTransactions = filteredTransactions.filter((tx) => tx && tx.time);
  if (validTransactions.length === 0) {
    return [];
  }

  const dataStartTime = Math.min(...validTransactions.map((tx) => tx.time));
  const dataEndTime = Math.max(...validTransactions.map((tx) => tx.time));

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

  validTransactions.forEach((tx) => {
    if (tx.time && tx.value > 0 && isFinite(tx.value) && tx.volume > 0) {
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
            time: parseInt(bucketKey) + Math.floor((interval * 1000) / 2),
            quotePerBase: finalPrice,
            basePerQuote: finalPrice > 0 ? 1 / finalPrice : 0,
            volume: Math.max(0, totalVol),
            isBuyingBase: isBuyingBase,
          });
        }
      }
    }
  });
  data.sort((a, b) => (a.time || 0) - (b.time || 0));
  return data;
};

export const calculateStats = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return { current: 0, high: 0, low: 0, change24h: 0, volume: 0 };
  }
  const validData = data.filter(
    (d) =>
      d &&
      d.quotePerBase &&
      d.quotePerBase >= 1 &&
      isFinite(d.quotePerBase) &&
      d.volume >= 0
  );
  if (validData.length === 0) {
    return { current: 0, high: 0, low: 0, change24h: 0, volume: 0 };
  }
  const values = validData.map((d) => d.quotePerBase);
  const current = validData[validData.length - 1]?.quotePerBase || 0;
  const sortedValues = [...values].sort((a, b) => a - b);
  const removeCount = Math.max(0, Math.floor(sortedValues.length * 0.02));
  const filteredValues =
    sortedValues.length > removeCount * 2
      ? sortedValues.slice(
          removeCount,
          Math.max(removeCount + 1, sortedValues.length - removeCount)
        )
      : sortedValues;
  const high =
    filteredValues.length > 0
      ? Math.max(...filteredValues.filter((v) => v && v >= 1))
      : Math.max(...values.filter((v) => v && v >= 1)) || 0;
  const low =
    filteredValues.length > 0
      ? Math.min(...filteredValues.filter((v) => v && v >= 1))
      : Math.min(...values.filter((v) => v && v >= 1)) || 0;
  const now = Date.now();
  const oneDayAgo = now - 24 * 3600 * 1000;
  const dayAgoPoint = validData.find((d) => d.time >= oneDayAgo);
  const change24h =
    dayAgoPoint && dayAgoPoint.quotePerBase > 0
      ? ((current - dayAgoPoint.quotePerBase) / dayAgoPoint.quotePerBase) * 100
      : 0;
  const volume = validData.reduce((sum, d) => {
    const vol = d.volume || 0;
    return sum + Math.max(0, vol);
  }, 0);

  return {
    current: isFinite(current) ? current : 0,
    high: isFinite(high) ? high : 0,
    low: isFinite(low) && low >= 0 ? low : 0,
    change24h: isFinite(change24h) ? change24h : 0,
    volume: isFinite(volume) ? volume : 0,
  };
};

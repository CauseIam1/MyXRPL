import { determineBaseCurrency, asciiToHex } from "./tradingChart.utils";
const CACHE_PREFIX = "chart_data_cache_";
const CACHE_DURATION = 24 * 60 * 60 * 1000;
const PROCESSED_CACHE_DURATION = 30 * 60 * 1000;
const MAX_TRANSACTIONS = 5000;
const getCachedTransactions = (key, isProcessed = false) => {
  try {
    const cacheKey = `${CACHE_PREFIX}${
      isProcessed ? "processed_" : "raw_"
    }${key}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const expiration = isProcessed
        ? PROCESSED_CACHE_DURATION
        : CACHE_DURATION;
      if (parsed.expires > Date.now()) {
        return parsed.data;
      }
      localStorage.removeItem(cacheKey);
    }
  } catch (e) {}
  return null;
};

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
      if (key && key.startsWith(CACHE_PREFIX)) {
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

const cacheTransactions = (key, data, isProcessed = false) => {
  try {
    let dataToCache = data;
    if (!isProcessed && data && data.length > 500) {
      dataToCache = data.slice(0, 500); // Limit raw data to 500 items
    } else if (isProcessed && data && data.length > 300) {
      dataToCache = data.slice(0, 300); // Limit processed data to 300 items
    }
    const cacheKey = `${CACHE_PREFIX}${
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
    if (isQuotaExceededError && isQuotaExceededError(e)) {
      console.warn("LocalStorage quota exceeded, cleaning up...");
      cleanupCacheAggressively();
    }
  }
};

const isValidTransaction = (tx) => {
  if (!tx || !tx.tx || !tx.meta) return false;
  if (tx.tx.TransactionType !== "Payment") return false;
  if (tx.meta.TransactionResult !== "tesSUCCESS") return false;
  return true;
};

const sampleLargeDataset = (data, maxPoints = MAX_TRANSACTIONS) => {
  if (!data || data.length <= maxPoints) return data || [];
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
};

const determineSwapDirection = (tx, targetCurrency, targetIssuer) => {
  try {
    if (!tx || !tx.tx || !tx.meta) return null;
    const meta = tx.meta || tx.metaData;
    const hexCurrency = asciiToHex(targetCurrency);
    const delivered = meta.DeliveredAmount || tx.tx.Amount;
    const sent = tx.tx.SendMax || tx.tx.Amount;
    const deliveredIsXrp = typeof delivered === "string";
    const deliveredIsTargetToken =
      typeof delivered === "object" &&
      ((targetCurrency.length <= 3 &&
        delivered.currency === targetCurrency &&
        delivered.issuer === targetIssuer) ||
        (targetCurrency.length > 3 &&
          delivered.currency === hexCurrency &&
          delivered.issuer === targetIssuer));
    const sentIsXrp = typeof sent === "string";
    const sentIsTargetToken =
      typeof sent === "object" &&
      ((targetCurrency.length <= 3 &&
        sent.currency === targetCurrency &&
        sent.issuer === targetIssuer) ||
        (targetCurrency.length > 3 &&
          sent.currency === hexCurrency &&
          sent.issuer === targetIssuer));
    if (deliveredIsXrp && sentIsTargetToken) {
      return "sell";
    } else if (deliveredIsTargetToken && sentIsXrp) {
      return "buy";
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const loadPairChartData = async (
  selectedPair,
  tokenPrices,
  setProgress
) => {
  try {
    const pairKey = `${selectedPair.currency1}-${selectedPair.issuer1}->${selectedPair.currency2}-${selectedPair.issuer2}`;
    const processedCached = getCachedTransactions(`pair_${pairKey}`, true);
    if (processedCached) {
      return { chartData: processedCached };
    }
    const cached = getCachedTransactions(`pair_${pairKey}`);
    if (cached) {
      const processed = cached
        .map((item) => ({
          ...item,
          timestamp: item.timestamp || item.tx?.date + 946684800,
        }))
        .filter((item) => item.timestamp && item.timestamp > 0);

      cacheTransactions(`pair_${pairKey}`, processed, true);
      return { chartData: processed };
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
    const sampledData = sampleLargeDataset(ammData);
    cacheTransactions(`pair_${pairKey}`, sampledData);
    return {
      chartData: sampledData,
      poolAddress,
      totalPages: Math.ceil(ammTransactions.length / 100),
      totalDataPoints: ammTransactions.length,
    };
  } catch (err) {
    return { error: `Failed to load data: ${err.message}` };
  }
};

export const loadTokenChartData = async (selectedToken, setProgress) => {
  try {
    const tokenKey = `${selectedToken.currency}-${selectedToken.issuer}`;
    const processedCached = getCachedTransactions(`token_${tokenKey}`, true);
    if (processedCached) {
      return { chartData: processedCached };
    }
    const cached = getCachedTransactions(`token_${tokenKey}`);
    if (cached) {
      const processed = cached
        .map((item) => ({
          ...item,
          timestamp: item.timestamp || item.tx?.date + 946684800,
        }))
        .filter((item) => item.timestamp && item.timestamp > 0);

      cacheTransactions(`token_${tokenKey}`, processed, true);
      return { chartData: processed };
    }
    setProgress({ message: "Searching for AMM pool...", percent: 10 });
    const poolResult = await getAmmPoolAddress(
      selectedToken.currency,
      selectedToken.issuer
    );
    setProgress({ message: "Fetching AMM transactions...", percent: 20 });
    let ammTransactions = [];
    if (poolResult && poolResult.address) {
      ammTransactions = await fetchTransactions(
        poolResult.address,
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
    const uniqueTransactions = new Map();
    [...ammTransactions, ...dexTransactions].forEach((tx) => {
      if (tx.tx && tx.tx.hash) {
        uniqueTransactions.set(tx.tx.hash, tx);
      }
    });
    const allUniqueTransactions = Array.from(uniqueTransactions.values());
    const processedData = allUniqueTransactions
      .map((tx) =>
        extractTokenTransactionData(
          tx,
          selectedToken.currency,
          selectedToken.issuer
        )
      )
      .filter(Boolean);
    const sampledData = sampleLargeDataset(processedData);
    cacheTransactions(`token_${tokenKey}`, sampledData);
    return {
      chartData: sampledData,
      poolAddress: poolResult?.address,
      totalPages: Math.ceil(allUniqueTransactions.length / 100),
      totalDataPoints: allUniqueTransactions.length,
    };
  } catch (err) {
    return { error: `Failed to load data: ${err.message}` };
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
          wsPool
            .getConnection(endpoint)
            .then((ws) => {
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
                      fee_mult_max: 10000,
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

export const fetchTransactions = async (
  account,
  isAmmPool,
  targetCurrency,
  targetIssuer
) => {
  const endpoints = [
    "wss://xrplcluster.com",
    "wss://s2.ripple.com:51233",
    "wss://xrpl.ws",
    "wss://s1.ripple.com:443",
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
      if (transactions.length > 0) {
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
  targetCurrency,
  targetIssuer
) => {
  let allTransactions = [];
  let marker = null;
  let pagesFetched = 0;
  const maxPages = 10;
  const hexCurrency = targetCurrency ? asciiToHex(targetCurrency) : null;
  do {
    try {
      const pageTransactions = await new Promise((resolve) => {
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
          resolve([]);
        }, 10000);
        wsPool
          .getConnection(endpoint)
          .then((websocket) => {
            ws = websocket;

            ws.onopen = () => {
              try {
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
                    fee_mult_max: 10000,
                  })
                );
              } catch (sendError) {
                cleanup();
                resolve([]);
              }
            };
            ws.onmessage = (event) => {
              try {
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
              } catch (parseError) {
                console.warn("Error parsing transaction data:", parseError);
                cleanup();
                resolve({ transactions: [], marker: null });
              }
            };
            ws.onerror = (error) => {
              console.warn("WebSocket error:", error);
              cleanup();
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
              }
              resolve([]);
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
            resolve([]);
          });
      });
      if (pageTransactions.transactions.length > 0) {
        allTransactions = [
          ...allTransactions,
          ...pageTransactions.transactions,
        ];
        marker = pageTransactions.marker;
        pagesFetched++;
        if (allTransactions.length > MAX_TRANSACTIONS * 2) {
          allTransactions = sampleLargeDataset(
            allTransactions,
            MAX_TRANSACTIONS
          );
        }
        if (!marker || pagesFetched >= maxPages) break;
        await new Promise((r) => setTimeout(r, 200));
      } else {
        break;
      }
    } catch (error) {
      console.warn("Error fetching page:", error);
      break;
    }
  } while (marker && pagesFetched < maxPages);
  const finalTransactions = sampleLargeDataset(
    allTransactions,
    MAX_TRANSACTIONS
  );
  return finalTransactions;
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
    if (!isValidTransaction(tx)) {
      return null;
    }
    const meta = tx.meta || tx.metaData;
    if (!meta || !tx.tx) {
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
    return {
      quotePerBase: price,
      basePerQuote: price > 0 ? 1 / price : 0,
      volume: quoteAmount,
      quoteVolume: quoteAmount,
      baseVolume: baseAmount,
      timestamp,
    };
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
    if (!isValidTransaction(tx)) {
      return null;
    }
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
      let swapDirection = null;
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
        swapDirection = "buy";
      } else if (sentIsTargetToken && deliveredIsXrp) {
        tokenAmount = parseFloat(sent.value);
        xrpAmount = parseFloat(delivered) / 1000000;
        swapDirection = "sell";
      } else {
        swapDirection = determineSwapDirection(
          tx,
          targetCurrency,
          targetIssuer
        );
        if (sentIsXrp) {
          xrpAmount = parseFloat(sent) / 1000000;
        } else if (sentIsTargetToken) {
          tokenAmount = parseFloat(sent.value);
        }
        if (deliveredIsXrp) {
          xrpAmount = parseFloat(delivered) / 1000000;
        } else if (deliveredIsTargetToken) {
          tokenAmount = parseFloat(delivered.value);
        }
        if (!swapDirection && xrpAmount > 0 && tokenAmount > 0) {
          if (deliveredIsXrp && sentIsTargetToken) {
            swapDirection = "sell";
          } else if (deliveredIsTargetToken && sentIsXrp) {
            swapDirection = "buy";
          }
        }
      }
      const MIN_XRP_AMOUNT = 0.000001;
      const MIN_TOKEN_AMOUNT = 0.000001;
      if (xrpAmount <= 0 || tokenAmount <= 0) {
        if (sentIsXrp) {
          xrpAmount = parseFloat(sent) / 1000000;
        } else if (deliveredIsXrp) {
          xrpAmount = parseFloat(delivered) / 1000000;
        }
        if (sentIsTargetToken) {
          tokenAmount = parseFloat(sent.value);
        } else if (deliveredIsTargetToken) {
          tokenAmount = parseFloat(delivered.value);
        }
      }
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
          swapDirection,
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
  const timestamps = mergedData
    .map((tx) => tx.timestamp)
    .filter((t) => t && t > 0);
  if (timestamps.length === 0) return [];
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const actualDataSpan = maxTimestamp - minTimestamp;
  const actualDays = actualDataSpan / (24 * 3600);
  if (timeRange === "ALL") {
    const sortedTransactions = [...mergedData].sort(
      (a, b) => a.timestamp - b.timestamp
    );
    let filteredTransactions = sortedTransactions;
    if (sortedTransactions.length > 10) {
      const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
      const prices = sortedTransactions.map((tx) => tx[priceKey]);
      const sortedPrices = [...prices].sort((a, b) => a - b);
      const q1Index = Math.floor(sortedPrices.length * 0.25);
      const q3Index = Math.floor(sortedPrices.length * 0.75);
      const q1 = sortedPrices[q1Index];
      const q3 = sortedPrices[q3Index];
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      filteredTransactions = sortedTransactions.filter((tx) => {
        return (
          tx[priceKey] >= Math.max(0, lowerBound * 0.5) &&
          tx[priceKey] <= upperBound * 2
        );
      });
    }

    if (filteredTransactions.length <= 100) {
      return filteredTransactions
        .map((tx) => {
          const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
          const volumeKey = isPairChart ? "volume" : "assetVolume";
          return {
            time: tx.timestamp * 1000,
            quotePerBase: isPairChart ? tx.quotePerBase : undefined,
            tokensPerXrp: isPairChart ? undefined : tx.tokensPerXrp,
            volume: tx[volumeKey] || 0,
            assetVolume: tx.assetVolume || 0,
            xrpVolume:
              tx.xrpVolume || (isPairChart ? tx.baseVolume : tx.volume) || 0,
            high: tx[priceKey],
            low: tx[priceKey],
            open: tx[priceKey],
            close: tx[priceKey],
            swapDirection: tx.swapDirection || null,
          };
        })
        .filter(Boolean);
    }
    const timeSpan = maxTimestamp - minTimestamp;
    const numBuckets = 50;
    const interval = Math.max(60, Math.ceil(timeSpan / numBuckets));
    const buckets = {};
    for (let time = minTimestamp; time <= maxTimestamp; time += interval) {
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
        sellCount: 0,
        buyCount: 0,
      };
    }
    filteredTransactions.forEach((tx) => {
      const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
      if (
        tx.timestamp &&
        tx[priceKey] > 0 &&
        isFinite(tx[priceKey]) &&
        (tx.volume > 0 || tx.assetVolume > 0)
      ) {
        const bucketKey = Math.floor(tx.timestamp / interval);
        if (buckets[bucketKey]) {
          const bucket = buckets[bucketKey];
          bucket.transactions.push(tx);
          if (isPairChart) {
            bucket.assetVolume += tx.quoteVolume || tx.volume || 0;
            bucket.xrpVolume += tx.baseVolume || 0;
            bucket.totalXrp += tx.baseVolume || 0;
            bucket.totalTokens += tx.quoteVolume || tx.volume || 0;
          } else {
            bucket.assetVolume += tx.assetVolume || 0;
            bucket.xrpVolume += tx.volume || 0;
            bucket.totalTokens += tx.assetVolume || 0;
            bucket.totalXrp += tx.volume || 0;
            if (tx.swapDirection === "sell") {
              bucket.sellCount += 1;
            } else if (tx.swapDirection === "buy") {
              bucket.buyCount += 1;
            }
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
          let swapDirection = null;
          if (bucket.sellCount > bucket.buyCount) {
            swapDirection = "sell";
          } else if (bucket.buyCount > bucket.sellCount) {
            swapDirection = "buy";
          }
          const result = {
            time: parseInt(key) * interval * 1000,
            quotePerBase: isPairChart ? finalPrice : undefined,
            tokensPerXrp: isPairChart ? undefined : finalPrice,
            volume: bucket.assetVolume,
            assetVolume: bucket.assetVolume,
            xrpVolume: bucket.xrpVolume,
            high: bucket.high > 0 ? bucket.high : finalPrice,
            low:
              bucket.low === Infinity || bucket.low <= 0
                ? finalPrice
                : bucket.low,
            open: bucket.open || finalPrice,
            close: bucket.close || finalPrice,
            swapDirection: swapDirection,
          };
          return result;
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
    return data;
  }
  const now = Math.floor(Date.now() / 1000);
  let startTime;
  switch (timeRange) {
    case "1H":
      startTime = now - 3600;
      break;
    case "6H":
      startTime = now - 6 * 3600;
      break;
    case "24H":
      startTime = now - 24 * 3600;
      break;
    case "3D":
      startTime = now - 3 * 24 * 3600;
      break;
    case "7D":
      startTime = now - 7 * 24 * 3600;
      break;
    default:
      startTime = minTimestamp;
  }
  const interval =
    timeRange === "1H"
      ? 60 // 1 minute
      : timeRange === "6H"
      ? 300 // 5 minutes
      : timeRange === "24H"
      ? 900 // 15 minutes
      : timeRange === "3D" || timeRange === "7D"
      ? 3600 // 1 hour
      : 3600; // default 1 hour

  let recentTransactions = mergedData.filter(
    (tx) => tx.timestamp && tx.timestamp >= startTime && tx.timestamp <= now
  );
  if (recentTransactions.length === 0) {
    const sortedTransactions = [...mergedData].sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const latestValidTransaction = sortedTransactions.find((tx) => {
      const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
      return (
        tx[priceKey] > 0 &&
        isFinite(tx[priceKey]) &&
        (tx.volume > 0 || tx.assetVolume > 0)
      );
    });
    if (latestValidTransaction) {
      const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
      const volumeKey = isPairChart ? "volume" : "assetVolume";
      return [
        {
          time: now * 1000,
          [priceKey]: latestValidTransaction[priceKey],
          volume: latestValidTransaction[volumeKey] || 0,
          assetVolume: latestValidTransaction.assetVolume || 0,
          xrpVolume:
            latestValidTransaction.xrpVolume ||
            (isPairChart
              ? latestValidTransaction.baseVolume
              : latestValidTransaction.volume) ||
            0,
          high: latestValidTransaction[priceKey],
          low: latestValidTransaction[priceKey],
          open: latestValidTransaction[priceKey],
          close: latestValidTransaction[priceKey],
          swapDirection: latestValidTransaction.swapDirection || null,
        },
      ];
    }
    return [];
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
      sellCount: 0,
      buyCount: 0,
    };
  }

  recentTransactions.forEach((tx) => {
    const priceKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
    if (
      tx.timestamp &&
      tx[priceKey] > 0 &&
      isFinite(tx[priceKey]) &&
      (tx.volume > 0 || tx.assetVolume > 0)
    ) {
      const bucketKey = Math.floor(tx.timestamp / interval);
      if (buckets[bucketKey]) {
        const bucket = buckets[bucketKey];
        bucket.transactions.push(tx);
        if (isPairChart) {
          bucket.assetVolume += tx.quoteVolume || tx.volume || 0;
          bucket.xrpVolume += tx.baseVolume || 0;
          bucket.totalXrp += tx.baseVolume || 0;
          bucket.totalTokens += tx.quoteVolume || tx.volume || 0;
        } else {
          bucket.assetVolume += tx.assetVolume || 0;
          bucket.xrpVolume += tx.volume || 0;
          bucket.totalTokens += tx.assetVolume || 0;
          bucket.totalXrp += tx.volume || 0;
          if (tx.swapDirection === "sell") {
            bucket.sellCount += 1;
          } else if (tx.swapDirection === "buy") {
            bucket.buyCount += 1;
          }
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
        const bucketTimestamp = parseInt(key) * interval * 1000;
        let swapDirection = null;
        if (bucket.sellCount > bucket.buyCount) {
          swapDirection = "sell";
        } else if (bucket.buyCount > bucket.sellCount) {
          swapDirection = "buy";
        }
        const result = {
          time: bucketTimestamp,
          quotePerBase: isPairChart ? finalPrice : undefined,
          tokensPerXrp: isPairChart ? undefined : finalPrice,
          volume: bucket.assetVolume,
          assetVolume: bucket.assetVolume,
          xrpVolume: bucket.xrpVolume,
          high: bucket.high > 0 ? bucket.high : finalPrice,
          low:
            bucket.low === Infinity || bucket.low <= 0
              ? finalPrice
              : bucket.low,
          open: bucket.open || finalPrice,
          close: bucket.close || finalPrice,
          swapDirection: swapDirection,
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
  const volumeKey = isPairChart ? "volume" : "assetVolume";
  const validData = data.filter(
    (d) => d[priceKey] > 0 && isFinite(d[priceKey]) && d[volumeKey] >= 0
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
  const volume = validData.reduce((sum, d) => sum + (d[volumeKey] || 0), 0);
  return { current, high, low, change24h, volume };
};

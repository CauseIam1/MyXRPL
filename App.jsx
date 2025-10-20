import React, { useState, useEffect, useRef } from "react";
import SwapCard from "./components/SwapCard";
import {
  formatCurrencyCode,
  formatValueWithCommas,
  truncateAddress,
  getPairKey,
} from "./utils/formatters";
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accountAddress, setAccountAddress] = useState("");
  const [ledgerIndex, setLedgerIndex] = useState("Loading...");
  const [xrplClient, setXrplClient] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState("");
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
  const swapGroupsRef = useRef([]);
  const [ammPoolData, setAmmPoolData] = useState(null);
  const [selectedSwapPair, setSelectedSwapPair] = useState(null);
  const [ammLoading, setAmmLoading] = useState(false);
  const [reverseQuotes, setReverseQuotes] = useState({});
  const [batchReverseLoading, setBatchReverseLoading] = useState(false);
  const [batchReverseProgress, setBatchReverseProgress] = useState(0);
  const wsRef = useRef(null);
  const ammWsRef = useRef(null);
  const loadingCancelledRef = useRef(false);
  const ammPoolRef = useRef(null);
  const [hiddenPairs, setHiddenPairs] = useState(new Set());
  const [originalTransactions, setOriginalTransactions] = useState([]);
  const [advancedAnalytics, setAdvancedAnalytics] = useState(null);
  const [favoriteTokens, setFavoriteTokens] = useState([]);
  const [riskMetrics, setRiskMetrics] = useState(null);
  const [arbitrageChains, setArbitrageChains] = useState([]);
  const START_LEDGER = 87000589;
  const CACHE_KEY_PREFIX = "xrpl_transaction_cache_";
  const [chainProfitThreshold, setChainProfitThreshold] = useState(0.5);
  useEffect(() => {
    let cacheCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
        cacheCount++;
      }
    }
  }, []);
  const calculateAdvancedAnalyticsData = () => {
    if (transactions.length > 0) {
      try {
        setAdvancedAnalytics({ portfolio: true });
      } catch (error) {
        console.error("❌ Error calculating portfolio:", error);
      }
    }
  };
  const getSwapGroups = () => {
    if (transactions.length === 0) return [];
    const groupedSwaps = {};
    transactions.forEach((swap) => {
      const pairKey =
        swap.direction ||
        getPairKey(
          { currency: swap.c1, issuer: swap.i1 },
          { currency: swap.c2, issuer: swap.i2 }
        );
      if (!groupedSwaps[pairKey]) {
        groupedSwaps[pairKey] = {
          asset1: { currency: swap.c1, issuer: swap.i1 },
          asset2: { currency: swap.c2, issuer: swap.i2 },
          swaps: [],
          direction: pairKey,
        };
      }
      groupedSwaps[pairKey].swaps.push(swap);
    });
    const swapGroups = Object.values(groupedSwaps).map((group) => {
      group.swaps.sort((a, b) => new Date(b.date) - new Date(a.date));
      return group;
    });
    swapGroupsRef.current = swapGroups;
    return swapGroups;
  };
  const findArbitrageChains = (swapGroups, reverseQuotes) => {
    if (batchReverseLoading) {
      return [];
    }
    if (transactions.length === 0) {
      return [];
    }
    const chains = [];
    const maxChainLength = 4;
    const pairsData = swapGroups.map((group, index) => {
      const pairKey = getPairKey(group.asset1, group.asset2);
      const reverseQuote = reverseQuotes[pairKey];
      return {
        index,
        asset1: group.asset1,
        asset2: group.asset2,
        group,
        reverseQuote,
        isProfitable:
          reverseQuote &&
          reverseQuote.isProfit &&
          reverseQuote.profitPercent >= chainProfitThreshold,
        pairKey: pairKey,
      };
    });
    const profitablePairs = pairsData.filter((pair) => pair.isProfitable);
    if (profitablePairs.length < 2) {
      return [];
    }
    profitablePairs.forEach((startPair) => {
      const chain = [startPair];
      findNextChainLink(profitablePairs, chain, 1, maxChainLength, chains);
    });
    chains.sort((a, b) => b.totalProfitPercent - a.totalProfitPercent);
    return chains.slice(0, 10);
  };
  const findNextChainLink = (
    profitablePairs,
    currentChain,
    currentDepth,
    maxDepth,
    chains
  ) => {
    if (currentDepth >= maxDepth) {
      const totalProfitPercent = currentChain.reduce(
        (sum, pair) => sum + (pair.reverseQuote?.profitPercent || 0),
        0
      );
      if (totalProfitPercent >= chainProfitThreshold) {
        chains.push({
          pairs: [...currentChain],
          totalProfitPercent,
          chainPath: currentChain
            .map(
              (pair) =>
                `${formatCurrencyCode(
                  pair.asset1.currency
                )}→${formatCurrencyCode(pair.asset2.currency)}`
            )
            .join(" → "),
        });
      }
      return;
    }
    const lastPair = currentChain[currentChain.length - 1];
    const lastAsset = lastPair.asset2.currency;
    const lastIssuer = lastPair.asset2.issuer;
    const usedPairs = new Set();
    currentChain.forEach((pair) => {
      const canonicalKey = [pair.asset1.currency, pair.asset2.currency]
        .sort()
        .join("|");
      usedPairs.add(canonicalKey);
    });
    profitablePairs.forEach((nextPair) => {
      const canonicalKey = [nextPair.asset1.currency, nextPair.asset2.currency]
        .sort()
        .join("|");

      if (usedPairs.has(canonicalKey)) {
        return;
      }
      if (currentChain.some((pair) => pair.index === nextPair.index)) {
        return;
      }
      const matchesForward =
        nextPair.asset1.currency === lastAsset &&
        nextPair.asset1.issuer === lastIssuer;
      if (matchesForward && nextPair.isProfitable) {
        const newChain = [...currentChain, nextPair];
        findNextChainLink(
          profitablePairs,
          newChain,
          currentDepth + 1,
          maxDepth,
          chains
        );
      }
    });
  };
  useEffect(() => {
    if (transactions.length > 0 && Object.keys(reverseQuotes).length > 0) {
      calculateAdvancedAnalyticsData();
    }
  }, [transactions, reverseQuotes]);
  const trackWalletLogin = (walletAddress) => {
    try {
      const loginStatsKey = "walletLoginStats";
      const existingStats = JSON.parse(
        localStorage.getItem(loginStatsKey) || "{}"
      );
      const currentDate = new Date().toISOString().split("T")[0];
      if (!existingStats[walletAddress]) {
        existingStats[walletAddress] = {
          firstLogin: currentDate,
          totalLogins: 0,
          loginDates: [],
        };
      }
      existingStats[walletAddress].totalLogins += 1;
      if (!existingStats[walletAddress].loginDates.includes(currentDate)) {
        existingStats[walletAddress].loginDates.push(currentDate);
      }
      localStorage.setItem(loginStatsKey, JSON.stringify(existingStats));
    } catch (error) {
      console.error("Error tracking wallet login:", error);
    }
  };
  const isPairSelected = (group, selectedPair) => {
    if (!selectedPair) return false;
    const groupPairKey1 = getPairKey(group.asset1, group.asset2);
    const groupPairKey2 = getPairKey(group.asset2, group.asset1);
    const selectedPairKey1 = getPairKey(
      selectedPair.asset1,
      selectedPair.asset2
    );
    const selectedPairKey2 = getPairKey(
      selectedPair.asset2,
      selectedPair.asset1
    );
    return (
      groupPairKey1 === selectedPairKey1 ||
      groupPairKey1 === selectedPairKey2 ||
      groupPairKey2 === selectedPairKey1 ||
      groupPairKey2 === selectedPairKey2
    );
  };
  const renderProgressBar = (progress, message) => (
    <div
      style={{
        background: "rgba(39, 162, 219, 0.2)",
        color: "#60a5fa",
        padding: "15px",
        borderRadius: "5px",
        margin: "15px 0",
        textAlign: "center",
        border: "1px solid rgba(39, 162, 219, 0.3)",
        fontSize: "0.9rem",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "8px",
          background: "rgba(39, 162, 219, 0.2)",
          borderRadius: "4px",
          margin: "0 auto 10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "linear-gradient(90deg, #27a2db, #60a5fa)",
            borderRadius: "4px",
            transition: "width 0.3s ease",
          }}
        ></div>
      </div>
      <p>{message}</p>
      {progress > 0 && (
        <p style={{ fontSize: "0.7rem", marginTop: "5px" }}>
          {progress}% complete
        </p>
      )}
    </div>
  );
  useEffect(() => {
    if (
      transactions.length > 0 &&
      Object.keys(reverseQuotes).length > 0 &&
      !batchReverseLoading &&
      Object.keys(reverseQuotes).length >=
        Math.max(1, getSwapGroups().length * 0.5)
    ) {
      const timer = setTimeout(() => {
        const swapGroups = getSwapGroups();
        const chains = findArbitrageChains(swapGroups, reverseQuotes);
        setArbitrageChains(chains);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [transactions, reverseQuotes, batchReverseLoading]);
  useEffect(() => {
    if (
      transactions.length > 0 &&
      Object.keys(reverseQuotes).length > 0 &&
      !batchReverseLoading
    ) {
      const sampleQuotes = Object.entries(reverseQuotes)
        .slice(0, 5)
        .map(([key, quote]) => ({
          pair: key,
          profit: quote?.profitPercent?.toFixed(4) || "null",
          isProfit: quote?.isProfit || false,
        }));
    }
  }, [transactions, reverseQuotes, batchReverseLoading]);
  const initXRPL = () => {
    setError("");
    setAutoLoadAttempted(true);
    setLoadingProgress(0);
    loadingCancelledRef.current = false;
    try {
      const client = new WebSocket("wss://s1.ripple.com:443");
      wsRef.current = client;
      client.onopen = () => {
        setXrplClient(client);
        client.send(
          JSON.stringify({
            id: 1,
            command: "subscribe",
            streams: ["ledger"],
          })
        );
        setTimeout(() => {
          if (!loadingCancelledRef.current && !loadingTransactions) {
            loadTransactions();
          }
        }, 500);
      };
      client.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "ledgerClosed") {
          setLedgerIndex(data.ledger_index);
        }
      };
      client.onerror = (error) => {
        console.error("XRPL Connection Error:", error);
        setError(
          "Failed to connect to XRPL. Please check your internet connection."
        );
      };
      client.onclose = (event) => {};
    } catch (err) {
      console.error("XRPL Connection Failed:", err);
      setError("Failed to initialize XRPL connection.");
    }
  };
  const loadTransactions = async () => {
    if (!accountAddress || loadingCancelledRef.current) return;
    setLoadingTransactions(true);
    setLoadingProgress(0);
    setError("");
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${accountAddress}`;
      const cachedData = localStorage.getItem(cacheKey);
      let cachedTransactions = [];
      let lastProcessedLedger = START_LEDGER;
      if (cachedData) {
        try {
          const parsedCache = JSON.parse(cachedData);
          cachedTransactions = parsedCache.transactions || [];
          lastProcessedLedger = parsedCache.lastLedger || START_LEDGER;
        } catch (e) {
          console.error("Error parsing cached data:", e);
        }
      }
      const ws = new WebSocket("wss://s2.ripple.com:51233");
      let newTransactions = [];
      let marker = null;
      let totalLoaded = 0;
      const maxLedger = ledgerIndex === "Loading..." ? null : ledgerIndex;
      let requestCount = 0;
      const maxRequests = 100;
      ws.onopen = () => {
        if (loadingCancelledRef.current) {
          ws.close();
          return;
        }
        const request = {
          id: 1,
          command: "account_tx",
          account: accountAddress,
          ledger_index_min: lastProcessedLedger,
          ledger_index_max: -1,
          limit: 400,
          forward: true,
        };
        if (marker) request.marker = marker;
        ws.send(JSON.stringify(request));
      };
      ws.onmessage = (event) => {
        if (loadingCancelledRef.current) {
          ws.close();
          setLoadingTransactions(false);
          return;
        }
        const data = JSON.parse(event.data);
        if (data.result && data.result.transactions) {
          const batchSize = data.result.transactions.length;
          newTransactions = [...newTransactions, ...data.result.transactions];
          totalLoaded += batchSize;
          requestCount++;
          const progress = Math.min(
            100,
            Math.round((requestCount / maxRequests) * 100)
          );
          setLoadingProgress(progress);
          if (
            data.result.marker &&
            !loadingCancelledRef.current &&
            requestCount < maxRequests
          ) {
            marker = data.result.marker;
            setTimeout(() => {
              if (!loadingCancelledRef.current) {
                ws.send(
                  JSON.stringify({
                    id: 1,
                    command: "account_tx",
                    account: accountAddress,
                    ledger_index_min: lastProcessedLedger,
                    ledger_index_max: -1,
                    limit: 400,
                    forward: true,
                    marker: marker,
                  })
                );
              }
            }, 100);
          } else {
            const allTransactions = [...cachedTransactions, ...newTransactions];
            const { swaps: swapTransactions } =
              sortAndProcessTransactions(allTransactions);
            try {
              const transactionsToCache = allTransactions.slice(-300);
              const cacheData = {
                transactions: transactionsToCache,
                swaps: swapTransactions,
                lastLedger: maxLedger,
                timestamp: Date.now(),
                account: accountAddress,
              };
              localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (e) {
              console.error("Error caching transactions:", e);
              // Clear cache entry if storage fails
              try {
                localStorage.removeItem(cacheKey);
              } catch (clearError) {
                console.error("Error clearing cache:", clearError);
              }
            }
            setTransactions(swapTransactions);
            setLoadingTransactions(false);
            setLoadingProgress(0);
            ws.close();
          }
        } else {
          const { swaps: swapTransactions } =
            sortAndProcessTransactions(cachedTransactions);
          setTransactions(swapTransactions);
          setLoadingTransactions(false);
          setLoadingProgress(0);
          ws.close();
        }
      };
      ws.onerror = (error) => {
        console.error("Transaction Loading Error:", error);
        setError("Failed to load transactions from XRPL.");
        setLoadingTransactions(false);
        setLoadingProgress(0);
        ws.close();
      };
    } catch (err) {
      console.error("Transaction Loading Failed:", err);
      setError("Failed to load transactions.");
      setLoadingTransactions(false);
      setLoadingProgress(0);
    }
  };
  const cleanupCacheAggressively = () => {
    try {
      const keysToRemove = [];
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_KEY_PREFIX)) {
          const item = localStorage.getItem(key);
          totalSize += item ? item.length : 0;
          keysToRemove.push({
            key,
            size: item ? item.length : 0,
            data: item,
          });
        }
      }
      if (totalSize > 5 * 1024 * 1024) {
        keysToRemove.sort((a, b) => {
          try {
            const dataA = JSON.parse(a.data);
            const dataB = JSON.parse(b.data);
            return (dataA.timestamp || 0) - (dataB.timestamp || 0);
          } catch {
            return 0;
          }
        });
        let removedSize = 0;
        const targetToRemove = totalSize - 4 * 1024 * 1024;
        for (const item of keysToRemove) {
          if (removedSize >= targetToRemove) break;
          localStorage.removeItem(item.key);
          removedSize += item.size;
        }
      }
    } catch (error) {
      console.error("Error in aggressive cache cleanup:", error);
    }
  };
  const minimizeTransactionData = (transactions) => {
    const recentTransactions = transactions.slice(-500);
    return recentTransactions
      .map((tx) => ({
        hash: tx.tx?.hash,
        date: tx.tx?.date,
        swap: extractEssentialSwapData(tx),
      }))
      .filter((item) => item.swap !== null);
  };
  const extractEssentialSwapData = (item) => {
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
          ? tx.SendMax.value
          : typeof tx.Amount === "string"
          ? parseFloat(tx.Amount) / 1000000
          : tx.Amount.value,
      c2:
        meta.DeliveredAmount?.currency ||
        (typeof tx.Amount === "object" ? tx.Amount.currency : "XRP"),
      i2: meta.DeliveredAmount?.issuer || tx.Destination,
      v2: meta.DeliveredAmount
        ? typeof meta.DeliveredAmount === "string"
          ? parseFloat(meta.DeliveredAmount) / 1000000
          : meta.DeliveredAmount.value
        : typeof tx.Amount === "string"
        ? parseFloat(tx.Amount) / 1000000
        : tx.Amount.value,
    };
  };
  const sortAndProcessTransactions = (allTransactions) => {
    setOriginalTransactions(allTransactions);
    const transactionTypes = {};
    allTransactions.forEach((item) => {
      const type = item.tx?.TransactionType || "Unknown";
      transactionTypes[type] = (transactionTypes[type] || 0) + 1;
    });
    const pairTransactions = [];
    allTransactions.forEach((item) => {
      if (isTokenSwapTransaction(item)) {
        pairTransactions.push(item);
      }
    });
    let swaps = [];
    pairTransactions.forEach((item) => {
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
  const cleanupOldCache = () => {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_KEY_PREFIX)) {
          const cachedData = JSON.parse(localStorage.getItem(key));
          const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (cachedData.timestamp < oneWeekAgo) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error("Error cleaning up cache:", error);
    }
  };
  const getCacheInfo = (account) => {
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${account}`;
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        return {
          transactionCount: parsed.transactions?.length || 0,
          lastLedger: parsed.lastLedger,
          cachedAt: new Date(parsed.timestamp).toLocaleString(),
          age:
            Math.round((Date.now() - parsed.timestamp) / (60 * 1000)) +
            " minutes ago",
        };
      }
      return null;
    } catch (error) {
      console.error("Error getting cache info:", error);
      return null;
    }
  };
  useEffect(() => {
    cleanupOldCache();
  }, []);
  const isTokenSwapTransaction = (item) => {
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
  const extractTokenSwapData = (item) => {
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
  const loadAmmPoolData = (asset1, asset2) => {
    if (ammLoading) return;
    setAmmLoading(true);
    setAmmPoolData(null);
    try {
      const ws = new WebSocket("wss://s1.ripple.com:443");
      ammWsRef.current = ws;
      ws.onopen = () => {
        const request = {
          id: Math.floor(Math.random() * 1000) + 1000,
          command: "amm_info",
          asset: {
            currency: asset1.currency,
            issuer: asset1.issuer,
          },
          asset2: {
            currency: asset2.currency,
            issuer: asset2.issuer,
          },
        };
        ws.send(JSON.stringify(request));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.result) {
          setAmmPoolData(data.result);
        } else if (data.error) {
          console.error("❌ AMM Error:", data.error_message || data.error);
        }
        setAmmLoading(false);
        ws.close();
      };
      ws.onerror = (error) => {
        console.error("AMM Connection Error:", error);
        setAmmLoading(false);
        ws.close();
      };
    } catch (err) {
      console.error("AMM Loading Failed:", err);
      setAmmLoading(false);
    }
  };
  const calculateReverseQuote = (swap, poolData) => {
    if (!poolData || !swap) return null;
    try {
      let pool1, pool2;
      const tradingFee = 0.01;
      if (poolData.amm) {
        pool1 = poolData.amm.amount?.value
          ? parseFloat(poolData.amm.amount.value)
          : parseFloat(poolData.amm.amount);
        pool2 = poolData.amm.amount2?.value
          ? parseFloat(poolData.amm.amount2.value)
          : parseFloat(poolData.amm.amount2);
      } else {
        pool1 = poolData.amount?.value
          ? parseFloat(poolData.amount.value)
          : parseFloat(poolData.amount);
        pool2 = poolData.amount2?.value
          ? parseFloat(poolData.amount2.value)
          : parseFloat(poolData.amount2);
      }
      if (isNaN(pool1) || isNaN(pool2) || pool1 <= 0 || pool2 <= 0) {
        return null;
      }
      const amountToSell = swap.v2;
      const baseAmount = swap.v1;
      const inputAfterFee = amountToSell * (1 - tradingFee);
      const reverseAmount = (inputAfterFee * pool1) / (pool2 + inputAfterFee);
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
      };
    } catch (error) {
      console.error("Reverse quote calculation error:", error);
      return null;
    }
  };
  const calculateAmmQuote = (inputAmount, isSellAsset1) => {
    if (!ammPoolData || !inputAmount) return null;
    try {
      const input = parseFloat(inputAmount.toString().replace(/,/g, ""));
      if (isNaN(input) || input <= 0) return null;
      let pool1, pool2;
      const tradingFee = 0.01;
      if (ammPoolData.amm) {
        pool1 = ammPoolData.amm.amount?.value
          ? parseFloat(ammPoolData.amm.amount.value)
          : parseFloat(ammPoolData.amm.amount);
        pool2 = ammPoolData.amm.amount2?.value
          ? parseFloat(ammPoolData.amm.amount2.value)
          : parseFloat(ammPoolData.amm.amount2);
      } else {
        pool1 = ammPoolData.amount?.value
          ? parseFloat(ammPoolData.amount.value)
          : parseFloat(ammPoolData.amount);
        pool2 = ammPoolData.amount2?.value
          ? parseFloat(ammPoolData.amount2.value)
          : parseFloat(ammPoolData.amount2);
      }
      if (isNaN(pool1) || isNaN(pool2) || pool1 <= 0 || pool2 <= 0) {
        return null;
      }
      let output;
      if (isSellAsset1) {
        const inputAfterFee = input * (1 - tradingFee);
        output = (inputAfterFee * pool2) / (pool1 + inputAfterFee);
      } else {
        const outputBeforeFee = (input * pool1) / (pool2 + input);
        output = outputBeforeFee * (1 - tradingFee);
      }
      return output;
    } catch (error) {
      console.error("AMM calculation error:", error);
      return null;
    }
  };
  const handleSwapSelection = (asset1, asset2) => {
    setSelectedSwapPair({ asset1, asset2 });
    loadAmmPoolData(asset1, asset2);
  };
  const handleAmmCalculation = (value, isSell) => {
    if (!value || value === "") {
      document.getElementById("buy-amount").value = "";
      return;
    }
    const quote = calculateAmmQuote(value, isSell);
    if (quote !== null && !isNaN(quote) && isFinite(quote)) {
      const formattedQuote = parseFloat(quote).toLocaleString("en-US", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });
      document.getElementById("buy-amount").value = formattedQuote;
    } else {
      document.getElementById("buy-amount").value = "";
    }
  };
  const swapAssetPositions = () => {
    if (selectedSwapPair) {
      const newPair = {
        asset1: selectedSwapPair.asset2,
        asset2: selectedSwapPair.asset1,
      };
      setSelectedSwapPair(newPair);
    }
  };
  useEffect(() => {
    if (selectedSwapPair) {
      loadAmmPoolData(selectedSwapPair.asset1, selectedSwapPair.asset2);
    }
  }, [selectedSwapPair]);
  useEffect(() => {
    if (accountAddress) {
      const settings = {
        hiddenPairs: Array.from(hiddenPairs),
      };
      localStorage.setItem(
        `userSettings_${accountAddress}`,
        JSON.stringify(settings)
      );
    }
  }, [accountAddress, hiddenPairs]);
  useEffect(() => {
    if (accountAddress) {
      const savedSettings = localStorage.getItem(
        `userSettings_${accountAddress}`
      );
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          if (settings.hiddenPairs) {
            setHiddenPairs(new Set(settings.hiddenPairs));
          }
        } catch (error) {
          console.error("Error loading user settings:", error);
        }
      }
    }
  }, [accountAddress]);
  const handleLogin = (address) => {
    if (address && address.startsWith("r")) {
      setAccountAddress(address);
      setIsLoggedIn(true);
      loadingCancelledRef.current = false;
      trackWalletLogin(address);
      initXRPL();
    } else {
      alert("Please enter a valid XRP account address");
    }
  };
  const handleLogout = () => {
    loadingCancelledRef.current = true;
    if (ammWsRef.current) {
      ammWsRef.current.close();
    }
    setIsLoggedIn(false);
    setAccountAddress("");
    setLedgerIndex("Loading...");
    setTransactions([]);
    setError("");
    setAutoLoadAttempted(false);
    setLoadingProgress(0);
    setAmmPoolData(null);
    setSelectedSwapPair(null);
    setAmmLoading(false);
    setReverseQuotes({});
    setBatchReverseLoading(false);
    setBatchReverseProgress(0);
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (xrplClient) {
      xrplClient.close();
    }
  };
  useEffect(() => {
    cleanupOldCache();
    return () => {
      loadingCancelledRef.current = true;
      if (ammWsRef.current) {
        ammWsRef.current.close();
      }
    };
  }, []);
  useEffect(() => {
    if (
      transactions.length > 0 &&
      !batchReverseLoading &&
      Object.keys(reverseQuotes).length === 0
    ) {
      setTimeout(() => {
        loadBatchReverseQuotes();
      }, 1200);
    }
  }, [transactions, batchReverseLoading, reverseQuotes]);
  useEffect(() => {
    if (selectedSwapPair && ammPoolRef.current) {
      const scrollTimer = setTimeout(() => {
        if (
          ammPoolRef.current &&
          !batchReverseLoading &&
          !loadingTransactions
        ) {
          ammPoolRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      }, 1200);
      return () => clearTimeout(scrollTimer);
    }
  }, [selectedSwapPair, batchReverseLoading, loadingTransactions]);
  useEffect(() => {
    if (
      transactions.length > 0 &&
      !selectedSwapPair &&
      !batchReverseLoading &&
      !loadingTransactions &&
      Object.keys(reverseQuotes).length > 0
    ) {
      setTimeout(() => {
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
            const reverseQuoteA = reverseQuotes[pairKeyA];
            const reverseQuoteB = reverseQuotes[pairKeyB];
            const profitA = reverseQuoteA
              ? reverseQuoteA.profitPercent
              : -Infinity;
            const profitB = reverseQuoteB
              ? reverseQuoteB.profitPercent
              : -Infinity;
            return profitB - profitA;
          });
        if (swapGroups.length > 0) {
          const mostProfitableGroup = swapGroups[0];
          handleSwapSelection(
            mostProfitableGroup.asset1,
            mostProfitableGroup.asset2
          );
        }
      }, 500);
    }
  }, [
    transactions.length,
    selectedSwapPair,
    batchReverseLoading,
    loadingTransactions,
    reverseQuotes,
  ]);
  useEffect(() => {
    if (!transactions.length || loadingTransactions || batchReverseLoading)
      return;
    const interval = setInterval(() => {
      loadBatchReverseQuotes();
    }, 120000);
    return () => clearInterval(interval);
  }, [transactions.length, loadingTransactions, batchReverseLoading]);
  useEffect(() => {
    if (!selectedSwapPair || ammLoading) return;
    const interval = setInterval(() => {
      loadAmmPoolData(selectedSwapPair.asset1, selectedSwapPair.asset2);
    }, 120000);
    return () => clearInterval(interval);
  }, [selectedSwapPair, ammLoading]);
  const loadBatchReverseQuotes = async () => {
    if (batchReverseLoading || transactions.length === 0) return;
    setBatchReverseLoading(true);
    setBatchReverseProgress(0);
    setReverseQuotes({});
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
    const swapGroups = Object.values(groupedSwaps);
    const totalPairs = swapGroups.length;
    let processedPairs = 0;
    for (const group of swapGroups) {
      if (loadingCancelledRef.current) break;
      if (group.asset1.currency === group.asset2.currency) {
        const pairKey = getPairKey(group.asset1, group.asset2);
        setReverseQuotes((prev) => ({
          ...prev,
          [pairKey]: null,
        }));
        processedPairs++;
        const progress = Math.round((processedPairs / totalPairs) * 100);
        setBatchReverseProgress(progress);
        continue;
      }
      if (
        (group.asset1.currency === "XRP" && group.asset1.issuer) ||
        (group.asset2.currency === "XRP" && group.asset2.issuer)
      ) {
        const pairKey = getPairKey(group.asset1, group.asset2);
        setReverseQuotes((prev) => ({
          ...prev,
          [pairKey]: null,
        }));
        processedPairs++;
        const progress = Math.round((processedPairs / totalPairs) * 100);
        setBatchReverseProgress(progress);
        continue;
      }
      const latestSwap = group.swaps[0];
      const pairKey = getPairKey(group.asset1, group.asset2);
      try {
        const ammData = await new Promise((resolve, reject) => {
          const ws = new WebSocket("wss://s1.ripple.com:443");
          ws.onopen = () => {
            const request = {
              id: Math.floor(Math.random() * 1000) + 1000,
              command: "amm_info",
              asset: {
                currency: group.asset1.currency,
                issuer: group.asset1.issuer,
              },
              asset2: {
                currency: group.asset2.currency,
                issuer: group.asset2.issuer,
              },
            };
            ws.send(JSON.stringify(request));
          };
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.result) {
              resolve(data.result);
            } else if (data.error === "actNotFound") {
              resolve(null);
            } else {
              console.error(
                "❌ AMM Error for batch:",
                data.error || "No result"
              );
              reject(new Error(data.error || "AMM data not found"));
            }
            ws.close();
          };
          ws.onerror = (error) => {
            console.error("AMM Connection Error for batch:", error);
            reject(error);
            ws.close();
          };
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
              reject(new Error("AMM request timeout"));
            }
          }, 10000);
        });
        if (ammData) {
          const reverseQuote = calculateReverseQuote(latestSwap, ammData);
          if (reverseQuote) {
            setReverseQuotes((prev) => ({
              ...prev,
              [pairKey]: reverseQuote,
            }));
          } else {
            setReverseQuotes((prev) => ({
              ...prev,
              [pairKey]: null,
            }));
          }
        } else {
          setReverseQuotes((prev) => ({
            ...prev,
            [pairKey]: null,
          }));
        }
      } catch (error) {
        console.error(
          `❌ Error loading reverse quote for pair ${group.asset1.currency}/${group.asset2.currency}:`,
          error
        );
        setReverseQuotes((prev) => ({
          ...prev,
          [pairKey]: null,
        }));
      }
      processedPairs++;
      const progress = Math.round((processedPairs / totalPairs) * 100);
      setBatchReverseProgress(progress);
    }
    setBatchReverseLoading(false);
    setBatchReverseProgress(0);
  };
  const renderAmmPrices = (pair) => {
    if (!ammPoolData) return "Loading prices...";
    try {
      let pool1, pool2;
      if (ammPoolData.amm) {
        pool1 = ammPoolData.amm.amount?.value
          ? parseFloat(ammPoolData.amm.amount.value)
          : parseFloat(ammPoolData.amm.amount);
        pool2 = ammPoolData.amm.amount2?.value
          ? parseFloat(ammPoolData.amm.amount2.value)
          : parseFloat(ammPoolData.amm.amount2);
      } else {
        pool1 = ammPoolData.amount?.value
          ? parseFloat(ammPoolData.amount.value)
          : parseFloat(ammPoolData.amount);
        pool2 = ammPoolData.amount2?.value
          ? parseFloat(ammPoolData.amount2.value)
          : parseFloat(ammPoolData.amount2);
      }
      if (isNaN(pool1) || isNaN(pool2) || pool1 <= 0 || pool2 <= 0) {
        return "Invalid pool data";
      }
      const as1 = formatCurrencyCode(pair.asset1.currency);
      const as2 = formatCurrencyCode(pair.asset2.currency);
      const price1to2 = (pool2 / pool1) * 0.99;
      const price2to1 = (pool1 / pool2) * 0.99;
      return (
        <>
          1 {as1} = {price1to2.toFixed(6)} {as2}
          <br />1 {as2} = {price2to1.toFixed(6)} {as1}
        </>
      );
    } catch (error) {
      console.error("Error calculating AMM prices:", error);
      return "Error loading prices";
    }
  };
  const renderAmmPool = () => {
    if (
      transactions.length === 0 ||
      batchReverseLoading ||
      loadingTransactions
    ) {
      return null;
    }
    if (Object.keys(reverseQuotes).length === 0 && transactions.length > 0) {
      return null;
    }
    const currentPair =
      selectedSwapPair ||
      (transactions.length > 0
        ? {
            asset1: {
              currency: transactions[0].c1,
              issuer: transactions[0].i1,
            },
            asset2: {
              currency: transactions[0].c2,
              issuer: transactions[0].i2,
            },
          }
        : null);
    if (!currentPair) {
      return (
        <div
          ref={ammPoolRef}
          style={{
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            borderRadius: "15px",
            padding: "15px",
            border: "2px solid #27a2db",
            height: "30%",
            boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
            width: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: "bold",
                color: "#27a2db",
                marginBottom: "10px",
              }}
            >
              AMM Pool
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              Select a swap pair to view AMM data
            </p>
          </div>
        </div>
      );
    }
    const as1 = formatCurrencyCode(currentPair.asset1.currency);
    const as2 = formatCurrencyCode(currentPair.asset2.currency);
    return (
      <div
        ref={ammPoolRef}
        style={{
          background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
          borderRadius: "15px",
          padding: "15px",
          border: "2px solid #27a2db",
          height: "30%",
          boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
          width: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "10px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: "bold",
                color: "#27a2db",
                textAlign: "left",
              }}
            >
              AMM Pool: {as1}/{as2}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                textAlign: "right",
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#94a3b8",
                }}
              >
                {renderAmmPrices(currentPair)}
              </div>
              <button
                onClick={swapAssetPositions}
                style={{
                  background: "linear-gradient(135deg, #27a2db, #1565c0)",
                  color: "#ffffff",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "20px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "0.7rem",
                }}
              >
                Swap Assets
              </button>
            </div>
          </div>
        </div>
        {ammLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "calc(100% - 30px)",
              color: "#94a3b8",
            }}
          >
            <div
              style={{
                width: "30px",
                height: "30px",
                border: "3px solid rgba(39, 162, 219, 0.3)",
                borderTop: "3px solid #27a2db",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                marginBottom: "10px",
              }}
            ></div>
            <p>Loading AMM pool...</p>
          </div>
        ) : ammPoolData ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: "calc(100% - 50px)",
              }}
            >
              <div style={{ width: "45%" }}>
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    borderRadius: "12px",
                    padding: "8px",
                    border: "2px solid #27a2db",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "5px",
                    }}
                  >
                    <h4
                      style={{
                        color: "#60a5fa",
                        margin: "0",
                        fontSize: "0.9rem",
                      }}
                    >
                      Sell {as1}
                    </h4>
                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: "0.6rem",
                        margin: "0",
                      }}
                    >
                      Issuer: {currentPair.asset1.issuer.substring(0, 6)}...
                    </p>
                  </div>
                  <p
                    style={{
                      margin: "5px 0 0 0",
                      fontSize: "0.8rem",
                      color: "#ffffff",
                    }}
                  >
                    Amount:
                    <input
                      type="text"
                      placeholder="0.00"
                      id="sell-amount"
                      style={{
                        width: "100%",
                        padding: "6px",
                        marginTop: "3px",
                        border: "2px solid #27a2db",
                        borderRadius: "8px",
                        background: "rgba(30, 58, 95, 0.5)",
                        color: "#ffffff",
                        fontSize: "0.8rem",
                        fontWeight: "500",
                        textAlign: "center",
                      }}
                      onInput={(e) => {
                        handleAmmCalculation(e.target.value, true);
                      }}
                    />
                  </p>
                </div>
              </div>
              <div
                style={{
                  background: "linear-gradient(135deg, #27a2db, #1565c0)",
                  color: "#ffffff",
                  border: "2px solid #27a2db",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto",
                  fontSize: "1rem",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
                onClick={swapAssetPositions}
              >
                ⇄
              </div>
              <div style={{ width: "45%" }}>
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    borderRadius: "12px",
                    padding: "8px",
                    border: "2px solid #27a2db",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "5px",
                    }}
                  >
                    <h4
                      style={{
                        color: "#60a5fa",
                        margin: "0",
                        fontSize: "0.9rem",
                      }}
                    >
                      Buy {as2}
                    </h4>
                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: "0.6rem",
                        margin: "0",
                      }}
                    >
                      Issuer: {currentPair.asset2.issuer.substring(0, 6)}...
                    </p>
                  </div>
                  <p
                    style={{
                      margin: "5px 0 0 0",
                      fontSize: "0.8rem",
                      color: "#ffffff",
                    }}
                  >
                    Amount:
                    <input
                      type="text"
                      placeholder="0.00"
                      id="buy-amount"
                      readOnly
                      style={{
                        width: "100%",
                        padding: "6px",
                        marginTop: "3px",
                        border: "2px solid #27a2db",
                        borderRadius: "8px",
                        background: "rgba(30, 58, 95, 0.5)",
                        color: "#ffffff",
                        fontSize: "0.8rem",
                        fontWeight: "500",
                        textAlign: "center",
                      }}
                    />
                  </p>
                </div>
              </div>
            </div>
            <div
              style={{
                textAlign: "center",
                marginTop: "5px",
                fontSize: "0.7rem",
                color: "#94a3b8",
              }}
            >
              Pool Fee: 1%
            </div>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "calc(100% - 30px)",
              color: "#94a3b8",
            }}
          >
            <p>❌ No AMM pool found for this pair</p>
            <button
              onClick={() =>
                loadAmmPoolData(currentPair.asset1, currentPair.asset2)
              }
              style={{
                background: "linear-gradient(135deg, #27a2db, #1565c0)",
                color: "#ffffff",
                border: "none",
                padding: "6px 12px",
                borderRadius: "20px",
                cursor: "pointer",
                fontWeight: "bold",
                marginTop: "8px",
                fontSize: "0.8rem",
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  };
  const renderFutureComponent = () => {
    if (transactions.length === 0) {
      return null;
    }
    if (batchReverseLoading) {
      return (
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            borderRadius: "15px",
            padding: "15px",
            border: "2px solid #27a2db",
            height: "35%",
            boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "#27a2db",
              textAlign: "center",
              marginBottom: "10px",
            }}
          >
            📊 Swap Profits
          </h3>
          <div
            style={{
              width: "30px",
              height: "30px",
              border: "3px solid rgba(39, 162, 219, 0.3)",
              borderTop: "3px solid #27a2db",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "15px",
            }}
          ></div>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.9rem",
              textAlign: "center",
            }}
          >
            Calculating swap profits...
          </p>
        </div>
      );
    }
    if (Object.keys(reverseQuotes).length === 0) {
      return (
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            borderRadius: "15px",
            padding: "15px",
            border: "2px solid #27a2db",
            height: "35%",
            boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "#27a2db",
              textAlign: "center",
              marginBottom: "10px",
            }}
          >
            📊 Swap Profits
          </h3>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.9rem",
              textAlign: "center",
            }}
          >
            Waiting for AMM data...
          </p>
        </div>
      );
    }
    const tokenData = calculateRealizedProfitsByToken();
    const allTokens = [
      ...tokenData.profitable.map((token) => ({ ...token, isDeficit: false })),
      ...tokenData.deficit.map((token) => ({ ...token, isDeficit: true })),
    ].sort((a, b) => {
      if (!a.isDeficit && !b.isDeficit) {
        return b.totalNetAmount - a.totalNetAmount;
      }
      if (a.isDeficit && b.isDeficit) {
        return a.totalNetAmount - b.totalNetAmount;
      }
      return a.isDeficit ? 1 : -1;
    });
    return (
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
          borderRadius: "15px",
          padding: "15px",
          border: "2px solid #27a2db",
          height: "35%",
          boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
          width: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "#27a2db",
              textAlign: "center",
              margin: 0,
            }}
          >
            📊 Token Positions
          </h3>
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: "0.8rem",
            color: "#cbd5e1",
            width: "100%",
            flexGrow: 1,
            overflowY: "auto",
            paddingRight: "15px",
          }}
        >
          {allTokens.length > 0 ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: "bold",
                  padding: "4px 0",
                  borderBottom: "1px solid rgba(39, 162, 219, 0.3)",
                  color: "#60a5fa",
                }}
              >
                <div>Asset</div>
                <div>Amount</div>
              </div>
              {allTokens.map((token, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: "6px",
                    padding: "4px 0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      color: "#60a5fa",
                      textAlign: "left",
                      minWidth: "80px",
                    }}
                  >
                    {formatCurrencyCode(token.currency)}
                  </div>
                  <div
                    style={{
                      color: token.isDeficit ? "#f87171" : "#4ade80",
                      textAlign: "right",
                      minWidth: "120px",
                    }}
                  >
                    {token.formattedAmount}
                  </div>
                </div>
              ))}
              <div
                style={{
                  borderTop: "1px solid rgba(39, 162, 219, 0.3)",
                  marginTop: "8px",
                  paddingTop: "8px",
                  fontWeight: "bold",
                  fontSize: "0.85rem",
                }}
              ></div>
            </>
          ) : (
            <div
              style={{
                textAlign: "center",
                color: "#94a3b8",
                fontStyle: "italic",
                padding: "20px 0",
              }}
            >
              No token positions found
            </div>
          )}
        </div>
      </div>
    );
  };
  const calculateRealizedProfitsByToken = () => {
    const tokenBalances = {};
    transactions.forEach((swap, index) => {
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
          issuer: swap.i1,
          balance: 0,
        };
      }
      tokenBalances[soldTokenKey].balance -= swap.v1;
      if (!tokenBalances[boughtTokenKey]) {
        tokenBalances[boughtTokenKey] = {
          currency: formattedC2,
          issuer: swap.i2,
          balance: 0,
        };
      }
      tokenBalances[boughtTokenKey].balance += swap.v2;
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
          consolidated.set(key, { ...token });
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
  const getCurrentTokenPrice = (token) => {
    return null;
  };
  const renderArbitrageChains = () => {
    if (batchReverseLoading) {
      return (
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            borderRadius: "15px",
            padding: "15px",
            border: "2px solid #27a2db",
            height: "35%",
            boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "#27a2db",
              marginBottom: "10px",
            }}
          >
            🔗 Sequential Swap Chains
          </h3>
          <div
            style={{
              width: "30px",
              height: "30px",
              border: "3px solid rgba(39, 162, 219, 0.3)",
              borderTop: "3px solid #27a2db",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "15px",
            }}
          ></div>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.9rem",
              textAlign: "center",
            }}
          >
            Waiting for AMM data to load...
          </p>
          <p style={{ color: "#60a5fa", fontSize: "0.8rem", marginTop: "5px" }}>
            {Object.keys(reverseQuotes).length} pairs processed
          </p>
        </div>
      );
    }
    if (
      arbitrageChains.length === 0 &&
      transactions.length > 0 &&
      !batchReverseLoading
    ) {
      return (
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            borderRadius: "15px",
            padding: "15px",
            border: "2px solid #27a2db",
            height: "35%",
            boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "#27a2db",
              textAlign: "center",
              marginBottom: "10px",
            }}
          >
            🔗 Sequential Swap Chains
          </h3>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.9rem",
              textAlign: "center",
            }}
          >
            No profitable Sequential Swap Chains found
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                Threshold:
              </span>
              <input
                type="range"
                min="0.1"
                max="50"
                step="0.1"
                value={chainProfitThreshold}
                onChange={(e) =>
                  setChainProfitThreshold(parseFloat(e.target.value))
                }
                style={{
                  width: "80px",
                  cursor: "pointer",
                }}
              />
              <span
                style={{
                  color: "#60a5fa",
                  fontSize: "0.8rem",
                  minWidth: "40px",
                }}
              >
                {chainProfitThreshold}%
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();

                if (
                  transactions.length > 0 &&
                  Object.keys(reverseQuotes).length > 0
                ) {
                  const swapGroups = getSwapGroups();
                  const chains = findArbitrageChains(swapGroups, reverseQuotes);
                  setArbitrageChains(chains);
                }
              }}
              style={{
                background: "linear-gradient(135deg, #27a2db, #1565c0)",
                color: "#ffffff",
                border: "1px solid #27a2db",
                padding: "4px 12px",
                borderRadius: "15px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.8rem",
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      );
    }
    if (arbitrageChains.length > 0) {
      return (
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            borderRadius: "15px",
            padding: "12px",
            border: "2px solid #27a2db",
            boxShadow: "0 4px 15px rgba(39, 162, 219, 0.2)",
            width: "100%",
            height: "35%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "#27a2db",
              marginBottom: "8px",
              textAlign: "center",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
          >
            <span>🔗 Sequential Swap Chains ({arbitrageChains.length})</span>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <input
                type="range"
                min="0.1"
                max="50"
                step="0.1"
                value={chainProfitThreshold}
                onChange={(e) =>
                  setChainProfitThreshold(parseFloat(e.target.value))
                }
                style={{
                  width: "80px",
                  cursor: "pointer",
                }}
              />
              <span
                style={{
                  color: "#60a5fa",
                  fontSize: "0.7rem",
                  minWidth: "40px",
                }}
              >
                {chainProfitThreshold}%
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const swapGroups = getSwapGroups();
                const chains = findArbitrageChains(swapGroups, reverseQuotes);
                setArbitrageChains(chains);
              }}
              style={{
                background: "linear-gradient(135deg, #27a2db, #1565c0)",
                color: "#ffffff",
                border: "1px solid #27a2db",
                padding: "2px 6px",
                borderRadius: "12px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.7rem",
                minWidth: "20px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Recalculate arbitrage chains"
            >
              ↻
            </button>
          </h3>
          <div
            style={{
              overflowY: "auto",
              fontSize: "0.8rem",
              flexGrow: 1,
            }}
          >
            {arbitrageChains.map((chain, index) => (
              <div
                key={index}
                style={{
                  background: "rgba(15, 23, 42, 0.7)",
                  borderRadius: "8px",
                  padding: "8px",
                  marginBottom: "6px",
                  border: "1px solid rgba(39, 162, 219, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: "#60a5fa",
                    marginBottom: "4px",
                    fontSize: "0.85rem",
                  }}
                >
                  {chain.chainPath}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    marginTop: "4px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        color: "#94a3b8",
                        fontSize: "0.7rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      {chain.pairs.map((pair, pairIndex) => (
                        <span key={pairIndex}>
                          {formatCurrencyCode(pair.asset1.currency)}→
                          {formatCurrencyCode(pair.asset2.currency)}
                          <span
                            style={{
                              color: pair.reverseQuote?.isProfit
                                ? "#4ade80"
                                : "#f87171",
                            }}
                          >
                            ({pair.reverseQuote?.profitPercent.toFixed(2)}%)
                          </span>
                        </span>
                      ))}
                    </div>
                    <div
                      style={{
                        color: "#4ade80",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        minWidth: "120px",
                        textAlign: "right",
                        paddingLeft: "10px",
                      }}
                    >
                      Total Profit: +{chain.totalProfitPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };
  const analyzeSwaps = () => {
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
        "🔍 Analyzing your AMM swaps... This may take a moment."
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
            🔍 Ignition Button
          </button>
        </div>
      );
    }
    const isMemeToken = (currency) => {
      const memeTokens = [
        "404",
        "245452554D500000000000000000000000000000", // $Trump
        "4D454C414E494100000000000000000000000000", // Melania
        "4245415200000000000000000000000000000000", // BEAR
        "414C4C494E000000000000000000000000000000", // ALLIN
        "424152524F4E5452554D50000000000000000000", // BARRONTRUMP
      ];
      return memeTokens.includes(currency);
    };
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
        const reverseQuoteA = reverseQuotes[pairKeyA];
        const reverseQuoteB = reverseQuotes[pairKeyB];
        const profitA =
          reverseQuoteA && reverseQuoteA !== null
            ? reverseQuoteA.profitPercent
            : -Infinity;
        const profitB =
          reverseQuoteB && reverseQuoteB !== null
            ? reverseQuoteB.profitPercent
            : -Infinity;
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
            "🔄 Calculating reverse quotes... This may take a moment as we fetch AMM data for each pair"
          )}
        {visibleSwapGroups.map((group, groupIndex) => (
          <SwapCard
            key={groupIndex}
            group={group}
            isSelected={isPairSelected(group, selectedSwapPair)}
            reverseQuote={reverseQuotes[getPairKey(group.asset1, group.asset2)]}
            handleSwapSelection={handleSwapSelection}
            setHiddenPairs={setHiddenPairs}
            getPairKey={getPairKey}
            formatCurrencyCode={formatCurrencyCode}
            formatValueWithCommas={formatValueWithCommas}
            truncateAddress={truncateAddress}
          />
        ))}
      </div>
    );
  };
  if (!isLoggedIn) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          background: "linear-gradient(135deg, #0f1c2e 0%, #1e3a5f 100%)",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          margin: 0,
          padding: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            padding: "40px",
            borderRadius: "20px",
            boxShadow: "0 15px 35px rgba(0, 0, 0, 0.5)",
            textAlign: "center",
            maxWidth: "450px",
            width: "90%",
            border: "2px solid #27a2db",
            position: "relative",
            backdropFilter: "blur(10px)",
            boxSizing: "border-box",
          }}
        >
          <h2
            style={{
              marginBottom: "20px",
              color: "#ffffff",
              fontSize: "2rem",
              background: "linear-gradient(45deg, #27a2db, #60a5fa, #93c5fd)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AMM Token Swapping Turbocharger
          </h2>
          <div
            style={{
              background: "rgba(30, 58, 95, 0.7)",
              border: "1px solid #27a2db",
              borderRadius: "15px",
              padding: "20px",
              marginBottom: "25px",
            }}
          >
            <h2
              style={{
                color: "#60a5fa",
                marginBottom: "15px",
                fontSize: "1.3rem",
              }}
            >
              Buckle up
            </h2>
            <p
              style={{
                marginBottom: "12px",
                lineHeight: "1.5",
                fontSize: "1rem",
                color: "#e2e8f0",
                fontWeight: "500",
              }}
            >
              Enter your r-address below
            </p>
          </div>
          <input
            type="text"
            placeholder="Enter XRP Account Address (r...)"
            aria-label="XRP Account Address"
            style={{
              width: "100%",
              padding: "15px",
              margin: "15px 0",
              border: "2px solid #27a2db",
              borderRadius: "10px",
              fontSize: "1rem",
              background: "rgba(15, 23, 42, 0.8)",
              color: "#ffffff",
              fontWeight: "500",
            }}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleLogin(e.target.value.trim());
              }
            }}
          />
          <button
            onClick={(e) => {
              const input = document.querySelector("input");
              handleLogin(input.value.trim());
            }}
            style={{
              background: "linear-gradient(135deg, #27a2db, #1565c0)",
              color: "#ffffff",
              border: "none",
              padding: "15px 30px",
              fontSize: "1.1rem",
              borderRadius: "30px",
              cursor: "pointer",
              marginTop: "15px",
              width: "100%",
              fontWeight: "bold",
              letterSpacing: "1px",
              textTransform: "uppercase",
              boxShadow: "0 5px 20px rgba(39, 162, 219, 0.4)",
            }}
            onMouseOver={(e) => {
              e.target.style.transform = "translateY(-3px) scale(1.02)";
              e.target.style.boxShadow = "0 8px 25px rgba(39, 162, 219, 0.6)";
            }}
            onMouseOut={(e) => {
              e.target.style.transform = "translateY(0) scale(1)";
              e.target.style.boxShadow = "0 5px 20px rgba(39, 162, 219, 0.4)";
            }}
          >
            Go Time
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        background: "linear-gradient(135deg, #0a1429, #0f1c2e, #1e3a5f)",
        minHeight: "100vh",
        position: "relative",
        margin: 0,
        padding: 0,
      }}
      role="main"
      aria-label="AMM Turbocharger Application"
    >
      <style>{`
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 0;
        overflow-x: hidden;
      }
      #root {
        margin: 0;
        padding: 0;
      }
    `}</style>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .switch {
          position: relative;
          display: inline-block;
          width: 40px;
          height: 20px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 20px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 2px;
          bottom: 2px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background: linear-gradient(135deg, #27a2db, #1565c0);
        }
        input:checked + .slider:before {
          transform: translateX(20px);
        }
      `}</style>
      <nav
        style={{
          position: "relative",
          background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
          color: "#ffffff",
          padding: "15px 20px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          zIndex: "1000",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "2px solid #27a2db",
          margin: "0",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            background: "linear-gradient(45deg, #27a2db, #60a5fa, #93c5fd)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          AMM Token Swapping Turbocharger
        </h1>
        <div style={{ display: "flex", gap: "15px", fontSize: "0.9rem" }}>
          <div
            style={{
              background: "rgba(30, 58, 95, 0.8)",
              padding: "8px 12px",
              borderRadius: "20px",
              border: "1px solid #27a2db",
              fontWeight: "500",
              color: "#e2e8f0",
            }}
          >
            Address: {accountAddress.substring(0, 10)}...
            {accountAddress.substring(accountAddress.length - 4)}
          </div>
          <div
            style={{
              background: "rgba(30, 58, 95, 0.8)",
              padding: "8px 12px",
              borderRadius: "20px",
              border: "1px solid #27a2db",
              fontWeight: "500",
              color: "#e2e8f0",
            }}
          >
            Ledger: {ledgerIndex}
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={handleLogout}
            style={{
              background: "linear-gradient(135deg, #27a2db, #1565c0)",
              color: "#ffffff",
              border: "1px solid #27a2db",
              padding: "8px 15px",
              borderRadius: "25px",
              cursor: "pointer",
              fontWeight: "bold",
              textTransform: "uppercase",
            }}
          >
            Disconnect
          </button>
        </div>
      </nav>
      <div
        style={{
          padding: "20px",
          display: "flex",
          gap: "20px",
          height: "calc(100vh - 120px)",
        }}
      >
        <div
          style={{
            width: "57%",
            minWidth: "300px",
            height: "100%",
            overflow: "auto",
            paddingRight: "20px",
          }}
        >
          {analyzeSwaps()}
        </div>
        <div
          style={{
            width: "43%",
            minWidth: "300px",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            height: "100%",
          }}
        >
          {renderAmmPool()}
          {renderArbitrageChains()}
          {renderFutureComponent()}
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          padding: "20px 0",
          color: "#94a3b8",
          fontSize: "0.9rem",
          fontWeight: "500",
        }}
      >
        <p style={{ marginBottom: "10px" }}>
          GitHub Repository:
          <a
            href="https://github.com/CauseIam1/MyXRPL"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#60a5fa",
              textDecoration: "none",
              marginLeft: "5px",
            }}
          >
            https://github.com/CauseIam1/MyXRPL
          </a>
        </p>
        <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
          For issues or questions, please open an issue on GitHub
        </p>
        <p style={{ fontSize: "0.7rem", color: "#475569", marginTop: "10px" }}>
          © {new Date().getFullYear()} AMM Token Swapping Turbocharger - XRPL
          Analytics Tool
        </p>
      </div>
    </div>
  );
}

export default App;

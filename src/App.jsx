import React, { useState, useEffect, useRef, useCallback } from "react";
import SwapCard from "./components/SwapCard";
import ResizableSplitView from "./components/ResizableSplitView";
import {
  formatCurrencyCode,
  formatValueWithCommas,
  truncateAddress,
  getPairKey,
} from "./utils/formatters";
import TokenPositions from "./components/TokenPositions";
import TokenChart from "./components/TokenChart";
import SequentialSwaps from "./components/SequentialSwaps";
import TokenAnalyzer from "./components/TokenAnalyzer";
import { calculateRealizedProfitsByToken } from "./utils/tokenUtils";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accountAddress, setAccountAddress] = useState("");
  const [ledgerIndex, setLedgerIndex] = useState("Loading...");
  const [xrplClient, setXrplClient] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState("");
  const [priceUpdateProgress, setPriceUpdateProgress] = useState(0);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const swapGroupsRef = useRef([]);
  const [reverseQuotes, setReverseQuotes] = useState({});
  const [batchReverseLoading, setBatchReverseLoading] = useState(false);
  const [batchReverseProgress, setBatchReverseProgress] = useState(0);
  const wsRef = useRef(null);
  const loadingCancelledRef = useRef(false);
  const [hiddenPairs, setHiddenPairs] = useState(new Set());
  const [arbitrageChains, setArbitrageChains] = useState([]);
  const START_LEDGER = 88000589;
  const CACHE_KEY_PREFIX = "xrpl_tx_cache_";
  const [filterSinceLogin, setFilterSinceLogin] = useState(false);
  const [loginLedger, setLoginLedger] = useState(START_LEDGER);
  const [tokenPrices, setTokenPrices] = useState({});
  const [chainProfitThreshold, setChainProfitThreshold] = useState(0.5);
  const [areTokenPositionsReady, setAreTokenPositionsReady] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("appTheme") || "blue";
  });
  const [fontFamily, setFontFamily] = useState(() => {
    return localStorage.getItem("appFont") || "showcardGothic";
  });
  const [selectedToken, setSelectedToken] = useState(null);
  const themes = {
    blue: {
      primary: "#27a2db",
      secondary: "#60a5fa",
      accent: "#93c5fd",
      background: "linear-gradient(135deg, #0a1429, #0f1c2e, #1e3a5f)",
      cardBackground: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
      text: "#ffffff",
      textSecondary: "#e2e8f0",
      border: "#27a2db",
    },
    purple: {
      primary: "#8b5cf6",
      secondary: "#a78bfa",
      accent: "#c4b5fd",
      background: "linear-gradient(135deg, #1a0b2e, #1e1b4b, #4c1d95)",
      cardBackground: "linear-gradient(135deg, #1e1b4b, #1a0b2e)",
      text: "#f3e8ff",
      textSecondary: "#e0c3fc",
      border: "#8b5cf6",
    },
    pink: {
      primary: "#ec4899",
      secondary: "#f472b6",
      accent: "#f9a8d4",
      background: "linear-gradient(135deg, #3c021d, #5e1735, #881337)",
      cardBackground: "linear-gradient(135deg, #5e1735, #3c021d)",
      text: "#fce7f3",
      textSecondary: "#fbcfe8",
      border: "#ec4899",
    },
    orange: {
      primary: "#f97316",
      secondary: "#fb923c",
      accent: "#fdba74",
      background: "linear-gradient(135deg, #3c1504, #5a2208, #9a3412)",
      cardBackground: "linear-gradient(135deg, #5a2208, #3c1504)",
      text: "#fff7ed",
      textSecondary: "#fed7aa",
      border: "#f97316",
    },
    green: {
      primary: "#22c55e",
      secondary: "#4ade80",
      accent: "#86efac",
      background: "linear-gradient(135deg, #052e16, #064e3b, #047857)",
      cardBackground: "linear-gradient(135deg, #064e3b, #052e16)",
      text: "#f0fdf4",
      textSecondary: "#bbf7d0",
      border: "#22c55e",
    },
    silver: {
      primary: "#94a3b8",
      secondary: "#cbd5e1",
      accent: "#e2e8f0",
      background: "linear-gradient(135deg, #1e293b, #334155, #64748b)",
      cardBackground: "linear-gradient(135deg, #334155, #1e293b)",
      text: "#f8fafc",
      textSecondary: "#e2e8f0",
      border: "#94a3b8",
    },
    gold: {
      primary: "#d4af37",
      secondary: "#facc15",
      accent: "#fef08a",
      background: "linear-gradient(135deg, #3b2a00, #5a4a00, #856800)",
      cardBackground: "linear-gradient(135deg, #5a4a00, #3b2a00)",
      text: "#fffbeb",
      textSecondary: "#fef08a",
      border: "#d4af37",
    },
  };
  const fonts = {
    cooperBlack: "'Cooper Black', 'Arial Black', sans-serif",
    tahoma: "'Tahoma', 'Geneva', 'Verdana', sans-serif",
    comicSans: "'Comic Sans MS', 'Comic Sans', cursive, sans-serif",
  };
  const getLocalStorageUsage = () => {
    let totalSize = 0;
    let itemCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const item = localStorage.getItem(key);
      totalSize += item ? item.length : 0;
      itemCount++;
    }
    return {
      totalSize: totalSize,
      itemCount: itemCount,
      usagePercent: Math.round((totalSize / (5 * 1024 * 1024)) * 100),
    };
  };

  const calculateReverseLatestPosition = (latestSwap, tokenPrices) => {
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

  const isQuotaExceededError = (err) => {
    return (
      err instanceof DOMException &&
      (err.code === 22 ||
        err.code === 1014 ||
        err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED")
    );
  };

  useEffect(() => {
    if (transactions.length > 0 && Object.keys(tokenPrices).length === 0) {
      fetchAllTokenPrices();
    }
  }, [transactions]);

  const fetchAllTokenPrices = async () => {
    if (transactions.length === 0) return;
    if (isUpdatingPrices) return;
    setIsUpdatingPrices(true);
    setPriceUpdateProgress(0);
    const uniqueTokens = new Set();
    const tokenMap = {};
    transactions.forEach((swap) => {
      if (swap.c1 !== "XRP") {
        const key = `${swap.c1}-${swap.i1}`;
        if (!tokenMap[key]) {
          tokenMap[key] = { currency: swap.c1, issuer: swap.i1 };
          uniqueTokens.add(key);
        }
      }
      if (swap.c2 !== "XRP") {
        const key = `${swap.c2}-${swap.i2}`;
        if (!tokenMap[key]) {
          tokenMap[key] = { currency: swap.c2, issuer: swap.i2 };
          uniqueTokens.add(key);
        }
      }
    });

    const updatedPrices = { ...tokenPrices };
    const tokensToFetch = Array.from(uniqueTokens).map((key) => tokenMap[key]);
    const totalTokens = tokensToFetch.length;
    const batchSize = 3;
    for (let i = 0; i < tokensToFetch.length; i += batchSize) {
      const batch = tokensToFetch.slice(i, i + batchSize);
      const batchPromises = batch.map(async (token) => {
        if (token.currency === "XRP") return;
        try {
          const result = await fetchTokenXrpPrice(token.currency, token.issuer);
          const priceKey = `${token.currency}-${token.issuer}`;
          if (
            result !== null &&
            result !== undefined &&
            !isNaN(result) &&
            result > 0
          ) {
            updatedPrices[priceKey] = result;
          } else {
            console.log(`Invalid price for ${priceKey}, setting to null`);
            updatedPrices[priceKey] = null;
          }
        } catch (error) {
          console.error(`Error fetching price for ${token.currency}:`, error);
          const priceKey = `${token.currency}-${token.issuer}`;
          updatedPrices[priceKey] = null;
        }
      });
      await Promise.all(batchPromises);
      const progress = Math.round(((i + batchSize) / totalTokens) * 100);
      setPriceUpdateProgress(Math.min(progress, 100));
    }
    setTokenPrices(updatedPrices);
    setIsUpdatingPrices(false);
    setPriceUpdateProgress(0);
    setTimeout(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 500);
  };

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

  const unhideAllPairs = () => {
    setHiddenPairs(new Set());
    if (accountAddress) {
      const settings = {
        hiddenPairs: [],
      };
      localStorage.setItem(
        `userSettings_${accountAddress}`,
        JSON.stringify(settings)
      );
    }
  };

  const renderPriceUpdateProgress = () => {
    if (!isUpdatingPrices) return null;
    return (
      <div
        style={{
          background: `rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
          color: themes[theme].secondary,
          padding: "10px",
          borderRadius: "5px",
          margin: "10px 0",
          textAlign: "center",
          border: `1px solid rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
          fontSize: "0.8rem",
          fontFamily: fonts[fontFamily],
        }}
      >
        <div
          style={{
            width: "100%",
            height: "6px",
            background: `rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
            borderRadius: "3px",
            margin: "0 auto 8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${priceUpdateProgress}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
              borderRadius: "3px",
              transition: "width 0.3s ease",
            }}
          ></div>
        </div>
        <p style={{ fontFamily: fonts[fontFamily], margin: "0 0 5px 0" }}>
          🔄 Updating token prices...
        </p>
        <p
          style={{
            fontSize: "0.7rem",
            marginTop: "2px",
            fontFamily: fonts[fontFamily],
          }}
        >
          {priceUpdateProgress}% complete
        </p>
      </div>
    );
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

  const hexToRgb = (hex) => {
    if (!hex) return "0, 0, 0";
    hex = hex.replace("#", "");
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
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
      const canonicalKey = [pair.fromCurrency, pair.toCurrency]
        .sort()
        .join("|");
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
          chains
        );
      }
    });
  };

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
      existingStats[walletAddress].loginLedger =
        ledgerIndex !== "Loading..." ? ledgerIndex : START_LEDGER;
      localStorage.setItem(loginStatsKey, JSON.stringify(existingStats));
      setLoginLedger(ledgerIndex !== "Loading..." ? ledgerIndex : START_LEDGER);
    } catch (error) {
      console.error("Error tracking wallet login:", error);
    }
  };

  const renderProgressBar = (progress, message) => (
    <div
      style={{
        background: `rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
        color: themes[theme].secondary,
        padding: "15px",
        borderRadius: "5px",
        margin: "15px 0",
        textAlign: "center",
        border: `1px solid rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
        fontSize: "0.9rem",
        fontFamily: fonts[fontFamily],
      }}
    >
      <div
        style={{
          width: "100%",
          height: "8px",
          background: `rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
          borderRadius: "4px",
          margin: "0 auto 10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
            borderRadius: "4px",
            transition: "width 0.3s ease",
          }}
        ></div>
      </div>
      <p style={{ fontFamily: fonts[fontFamily] }}>{message}</p>
      {progress > 0 && (
        <p
          style={{
            fontSize: "0.7rem",
            marginTop: "5px",
            fontFamily: fonts[fontFamily],
          }}
        >
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
  }, [transactions, reverseQuotes, batchReverseLoading, hiddenPairs]);

  const initXRPL = () => {
    setError("");
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

  const loadTransactions = async (overrideFilterSinceLogin = null) => {
    try {
      const usage = getLocalStorageUsage();
      if (usage.usagePercent > 80) {
        console.warn("High localStorage usage, cleaning up...");
        cleanupCacheAggressively();
      }
    } catch (e) {
      console.warn("Could not check localStorage usage");
    }
    const useFilter =
      overrideFilterSinceLogin !== null
        ? overrideFilterSinceLogin
        : filterSinceLogin;
    if (!accountAddress || loadingCancelledRef.current) return;
    setLoadingTransactions(true);
    setLoadingProgress(0);
    setError("");
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${accountAddress}`;
      const cachedData = localStorage.getItem(cacheKey);
      let cachedTransactions = [];
      let lastFullLoadLedger = START_LEDGER;
      if (cachedData) {
        try {
          const parsedCache = JSON.parse(cachedData);
          cachedTransactions = parsedCache.transactions || [];
          lastFullLoadLedger = parsedCache.lastLedger || START_LEDGER;
        } catch (e) {
          console.error("Error parsing cached data:", e);
        }
      }
      let allTransactions = [...cachedTransactions];
      let fetchedNewData = false;
      if (useFilter) {
        const minLedger = Math.max(lastFullLoadLedger, loginLedger);
        const maxLedger = ledgerIndex === "Loading..." ? null : ledgerIndex;
        if (minLedger < (maxLedger || Infinity)) {
          const newTransactions = await fetchTransactionsSince(
            accountAddress,
            minLedger,
            maxLedger
          );
          const transactionHashes = new Set(
            allTransactions.map((tx) => tx.tx?.hash)
          );
          const uniqueNewTransactions = newTransactions.filter(
            (tx) => tx.tx?.hash && !transactionHashes.has(tx.tx.hash)
          );
          allTransactions = [...allTransactions, ...uniqueNewTransactions];
          fetchedNewData = true;
        }
      } else {
        const completeTransactions = await fetchCompleteTransactionHistory(
          accountAddress
        );
        allTransactions = completeTransactions;
        fetchedNewData = true;
      }
      if (
        fetchedNewData ||
        allTransactions.length > cachedTransactions.length
      ) {
        setLoadingProgress(70);
        const { swaps: swapTransactions } =
          sortAndProcessTransactions(allTransactions);
        setLoadingProgress(80);
        try {
          const minimizedTransactions =
            minimizeTransactionData(allTransactions);
          const cacheData = {
            transactions: minimizedTransactions,
            swaps: swapTransactions,
            lastLedger:
              ledgerIndex === "Loading..." ? lastFullLoadLedger : ledgerIndex,
            timestamp: Date.now(),
            account: accountAddress,
          };
          const cacheSize = JSON.stringify(cacheData).length;
          if (cacheSize > 4 * 1024 * 1024) {
            console.warn("Cache too large, reducing size");
            cacheData.transactions = cacheData.transactions.slice(-200);
          }
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
          if (isQuotaExceededError(e)) {
            console.warn("LocalStorage quota exceeded, clearing cache");
            cleanupCacheAggressively();
            try {
              const minimalCache = {
                swaps: swapTransactions.slice(-100),
                lastLedger:
                  ledgerIndex === "Loading..."
                    ? lastFullLoadLedger
                    : ledgerIndex,
                timestamp: Date.now(),
              };
              localStorage.setItem(cacheKey, JSON.stringify(minimalCache));
            } catch (retryError) {
              console.error("Failed to cache even minimal data:", retryError);
            }
          } else {
            console.error("Error caching transactions:", e);
          }
        }
        setLoadingProgress(90);
        setTransactions(swapTransactions);
      }
      setLoadingProgress(100);
      setTimeout(() => {
        setLoadingTransactions(false);
        setLoadingProgress(0);
      }, 500);
    } catch (err) {
      console.error("Transaction Loading Failed:", err);
      setError("Failed to load transactions: " + err.message);
      setLoadingTransactions(false);
      setLoadingProgress(0);
    }
  };

  const fetchTransactionsSince = async (account, minLedger, maxLedger) => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket("wss://s2.ripple.com:51233");
      let transactions = [];
      let marker = null;
      let fetchCount = 0;
      ws.onopen = () => {
        const request = {
          id: 1,
          command: "account_tx",
          account: account,
          ledger_index_min: minLedger,
          ledger_index_max: maxLedger || -1,
          limit: 400,
          forward: true,
        };
        ws.send(JSON.stringify(request));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.result && data.result.transactions) {
          transactions = [...transactions, ...data.result.transactions];
          fetchCount++;
          if (fetchCount % 3 === 0) {
            setLoadingProgress(Math.min(50, Math.round(fetchCount * 2)));
          }
          if (data.result.marker) {
            marker = data.result.marker;
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  id: 1,
                  command: "account_tx",
                  account: account,
                  ledger_index_min: minLedger,
                  ledger_index_max: maxLedger || -1,
                  limit: 400,
                  forward: true,
                  marker: marker,
                })
              );
            }, 100);
          } else {
            ws.close();
            resolve(transactions);
          }
        } else {
          ws.close();
          resolve(transactions);
        }
      };
      ws.onerror = (error) => {
        console.error("Transaction Loading Error:", error);
        ws.close();
        reject(error);
      };
    });
  };

  const fetchCompleteTransactionHistory = async (account) => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket("wss://s2.ripple.com:51233");
      let transactions = [];
      let marker = null;
      ws.onopen = () => {
        const request = {
          id: 1,
          command: "account_tx",
          account: account,
          ledger_index_min: START_LEDGER,
          ledger_index_max: -1,
          limit: 400,
          forward: true,
        };
        ws.send(JSON.stringify(request));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.result && data.result.transactions) {
          transactions = [...transactions, ...data.result.transactions];
          if (data.result.marker) {
            marker = data.result.marker;
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  id: 1,
                  command: "account_tx",
                  account: account,
                  ledger_index_min: START_LEDGER,
                  ledger_index_max: -1,
                  limit: 400,
                  forward: true,
                  marker: marker,
                })
              );
            }, 100);
          } else {
            ws.close();
            resolve(transactions);
          }
        } else {
          ws.close();
          resolve(transactions);
        }
      };
      ws.onerror = (error) => {
        console.error("Transaction Loading Error:", error);
        ws.close();
        reject(error);
      };
    });
  };

  const fetchTokenXrpPrice = async (currency, issuer) => {
    if (currency === "XRP") return 1;
    if (!issuer) return null;
    try {
      const ws = new WebSocket("wss://s1.ripple.com:443");
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
          resolve(null);
        }, 5000);
        ws.onopen = () => {
          const request = {
            id: Math.floor(Math.random() * 1000) + 1000,
            command: "amm_info",
            asset: {
              currency: "XRP",
            },
            asset2: {
              currency: currency,
              issuer: issuer,
            },
          };
          ws.send(JSON.stringify(request));
        };
        ws.onmessage = (event) => {
          clearTimeout(timeout);
          const data = JSON.parse(event.data);
          if (data.result) {
            try {
              let poolXrp,
                poolToken,
                tradingFeeBasisPoints = 1000;
              if (data.result.amm) {
                if (typeof data.result.amm.amount === "string") {
                  poolXrp = parseFloat(data.result.amm.amount) / 1000000;
                } else if (
                  data.result.amm.amount &&
                  data.result.amm.amount.value
                ) {
                  poolXrp = parseFloat(data.result.amm.amount.value);
                } else {
                  poolXrp = parseFloat(data.result.amm.amount) / 1000000;
                }
                if (data.result.amm.amount2 && data.result.amm.amount2.value) {
                  poolToken = parseFloat(data.result.amm.amount2.value);
                } else {
                  poolToken = parseFloat(data.result.amm.amount2);
                }
                if (data.result.amm.trading_fee) {
                  tradingFeeBasisPoints = data.result.amm.trading_fee;
                }
              }
              if (
                isNaN(poolXrp) ||
                isNaN(poolToken) ||
                poolXrp <= 0 ||
                poolToken <= 0
              ) {
                ws.close();
                resolve(null);
                return;
              }
              const tradingFee = tradingFeeBasisPoints / 100000;
              const inputAmount = 1;
              const inputAfterFee = inputAmount * (1 - tradingFee);
              const tokensReceived =
                (inputAfterFee * poolToken) / (poolXrp + inputAfterFee);
              const xrpPerToken = 1 / tokensReceived;
              ws.close();
              resolve(xrpPerToken);
            } catch (e) {
              console.error(`Error processing AMM data for ${currency}:`, e);
              ws.close();
              resolve(null);
            }
          } else {
            console.log(`No AMM pool found for ${currency}`);
            ws.close();
            resolve(null);
          }
        };
        ws.onerror = (error) => {
          clearTimeout(timeout);
          ws.close();
          resolve(null);
        };
      });
      return result;
    } catch (error) {
      console.error(`Error fetching price for ${currency}/${issuer}:`, error);
      return null;
    }
  };

  const debugTokenCurrencies = () => {
    if (transactions.length === 0) return;
    const currencies = new Set();
    transactions.forEach((swap) => {
      if (swap.c1 !== "XRP") currencies.add(swap.c1);
      if (swap.c2 !== "XRP") currencies.add(swap.c2);
    });
  };

  const renderFutureComponent = () => {
    const visiblePairs = new Set();
    transactions.forEach((swap) => {
      const pairKey = getPairKey(
        { currency: swap.c1, issuer: swap.i1 },
        { currency: swap.c2, issuer: swap.i2 }
      );
      const containsXRP = swap.c1 === "XRP" || swap.c2 === "XRP";
      if (!hiddenPairs.has(pairKey) && !containsXRP) {
        visiblePairs.add(pairKey);
      }
    });
    const visiblePairsCount = visiblePairs.size;
    if (transactions.length === 0) {
      return null;
    }
    const tokenData = calculateRealizedProfitsByToken(
      transactions,
      hiddenPairs,
      formatCurrencyCode,
      formatValueWithCommas
    );
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

    const handleTokenSelect = (token) => {
      if (
        token &&
        token.currency &&
        (token.issuer || token.currency === "XRP")
      ) {
        const priceKey = `${token.currency}-${token.issuer}`;
        if (tokenPrices[priceKey] !== undefined) {
          setSelectedToken(token);
        } else {
          setTimeout(() => {
            setSelectedToken(token);
          }, 1000);
        }
      }
    };

    return (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ height: "100%" }}>
          <TokenPositions
            allTokens={allTokens}
            tokenPrices={tokenPrices}
            theme={theme}
            themes={themes}
            fontFamily={fontFamily}
            fonts={fonts}
            visiblePairsCount={visiblePairsCount}
            onTokenSelect={handleTokenSelect}
          />
        </div>
      </div>
    );
  };

  const fetchComprehensiveTokenData = async (currencyCode, issuer) => {
    try {
      const accountInfo = await new Promise((resolve, reject) => {
        const ws = new WebSocket("wss://s1.ripple.com:443");
        const timeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.close();
          resolve(null);
        }, 5000);
        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              id: 1,
              command: "account_info",
              account: issuer,
              strict: true,
            })
          );
        };
        ws.onmessage = (event) => {
          clearTimeout(timeout);
          const data = JSON.parse(event.data);
          if (data.result?.account_data) {
            ws.close();
            resolve({
              account: data.result.account_data.Account,
              xrpBalance: parseInt(data.result.account_data.Balance) / 1000000,
              sequence: data.result.account_data.Sequence,
              ownerCount: data.result.account_data.OwnerCount,
            });
          } else {
            ws.close();
            resolve(null);
          }
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          ws.close();
          resolve(null);
        };
      });
      const trustLines = await new Promise((resolve, reject) => {
        const ws = new WebSocket("wss://s1.ripple.com:443");
        const timeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.close();
          resolve(null);
        }, 8000);
        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              id: 2,
              command: "account_lines",
              account: issuer,
            })
          );
        };
        ws.onmessage = (event) => {
          clearTimeout(timeout);
          const data = JSON.parse(event.data);
          if (data.result?.lines) {
            const tokenLines = data.result.lines.filter(
              (line) => line.currency === currencyCode
            );
            let totalSupply = 0;
            let holders = 0;
            tokenLines.forEach((line) => {
              const balance = Math.abs(parseFloat(line.balance));
              if (balance > 0) {
                totalSupply += balance;
                holders++;
              }
            });
            ws.close();
            resolve({
              trustlines: tokenLines.length,
              holders: holders,
              totalSupply: totalSupply,
              lines: tokenLines,
            });
          } else {
            ws.close();
            resolve(null);
          }
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          ws.close();
          resolve(null);
        };
      });
      return {
        accountInfo,
        trustLines,
        currency: currencyCode,
        issuer: issuer,
      };
    } catch (error) {
      console.error("Error fetching comprehensive token data:", error);
      return null;
    }
  };

  const cleanupCacheAggressively = () => {
    try {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_KEY_PREFIX)) {
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
      console.log(`Cleaned up ${keysToRemove.length} old cache entries`);
    } catch (error) {
      console.error("Error in aggressive cache cleanup:", error);
    }
  };

  const minimizeTransactionData = (transactions) => {
    const recentTransactions = transactions.slice(-300);
    return recentTransactions
      .map((tx) => ({
        h: tx.tx?.hash,
        d: tx.tx?.date,
        s: extractEssentialSwapData(tx),
      }))
      .filter((item) => item.s !== null);
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

  const sortAndProcessTransactions = (allTransactions) => {
    const transactionTypes = {};
    allTransactions.forEach((item) => {
      const type = item.tx?.TransactionType || "Unknown";
      transactionTypes[type] = (transactionTypes[type] || 0) + 1;
    });
    const pairTransactions = [];
    const totalTransactions = allTransactions.length;
    allTransactions.forEach((item, index) => {
      if (index % Math.max(1, Math.floor(totalTransactions / 10)) === 0) {
        const progress = Math.round(70 + (index / totalTransactions) * 10);
        setLoadingProgress(progress);
      }
      if (isTokenSwapTransaction(item)) {
        pairTransactions.push(item);
      }
    });
    let swaps = [];
    const totalPairTransactions = pairTransactions.length;
    pairTransactions.forEach((item, index) => {
      if (index % Math.max(1, Math.floor(totalPairTransactions / 10)) === 0) {
        const progress = Math.round(80 + (index / totalPairTransactions) * 10);
        setLoadingProgress(progress);
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

  useEffect(() => {
    setAreTokenPositionsReady(false);
    setSelectedToken(null);
  }, [transactions]);

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

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (isLoggedIn && transactions.length > 0) {
      const interval = setInterval(() => {
        setPriceUpdateProgress(0);
        setIsUpdatingPrices(true);
        fetchAllTokenPrices().then(() => {
          setRefreshTrigger((prev) => prev + 1);
        });
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [isLoggedIn, transactions.length, hiddenPairs]);

  const calculateReverseQuote = (swap, poolData) => {
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
        ("Missing or invalid prices for reverse calculation");
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
      console.error("Reverse quote calculation error:", error);
      return null;
    }
  };

  const calculatePositionWithLivePrices = (group, tokenPrices) => {
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
      originalAmount: isLatestDirectionAsset1ToAsset2
        ? totalAsset1
        : totalAsset2,
      originalCurrency: isLatestDirectionAsset1ToAsset2
        ? group.asset1.currency
        : group.asset2.currency,
      receivedAmount: isLatestDirectionAsset1ToAsset2
        ? totalAsset2
        : totalAsset1,
      receivedCurrency: isLatestDirectionAsset1ToAsset2
        ? group.asset2.currency
        : group.asset1.currency,
      xrpValue1: xrpValue1,
      xrpValue2: xrpValue2,
    };
  };

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
    setIsLoggedIn(false);
    setAccountAddress("");
    setLedgerIndex("Loading...");
    setTransactions([]);
    setError("");
    setLoadingProgress(0);
    setReverseQuotes({});
    setBatchReverseLoading(false);
    setBatchReverseProgress(0);
    setAreTokenPositionsReady(false);
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
    };
  }, []);

  useEffect(() => {
    if (
      transactions.length > 0 &&
      !batchReverseLoading &&
      Object.keys(tokenPrices).length > 0
    ) {
      const newReverseQuotes = {};
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
      Object.values(groupedSwaps).forEach((group) => {
        const latestSwap = group.swaps[0];
        const pairKey = getPairKey(group.asset1, group.asset2);
        const reverseQuote = calculateReverseQuote(latestSwap, null);
        newReverseQuotes[pairKey] = reverseQuote;
      });
      setReverseQuotes(newReverseQuotes);
    }
  }, [transactions, tokenPrices, batchReverseLoading]);

  useEffect(() => {
    if (!transactions.length || loadingTransactions || batchReverseLoading)
      return;
    const interval = setInterval(() => {
      loadTransactions();
    }, 120000);
    return () => clearInterval(interval);
  }, [
    transactions.length,
    loadingTransactions,
    batchReverseLoading,
    filterSinceLogin,
    accountAddress,
    loginLedger,
    ledgerIndex,
  ]);

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
              fontSize: "2.5rem",
              background: "linear-gradient(45deg, #27a2db, #60a5fa, #93c5fd)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            MyXRPL Defi
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
              Swap Assets for Assets
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
              Then enter your r-address below
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
        fontFamily: fonts[fontFamily],
        background: themes[theme].background,
        minHeight: "100vh",
        position: "relative",
        margin: 0,
        padding: 0,
      }}
      role="main"
      aria-label="MyXRPL Defi"
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
      <nav
        style={{
          position: "relative",
          background:
            themes[theme]?.cardBackground || themes.blue.cardBackground,
          color: themes[theme]?.text || themes.blue.text,
          padding: "15px 20px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          zIndex: "1000",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `2px solid ${
            themes[theme]?.border || themes.blue.border
          }`,
          margin: "0",
          fontFamily: fonts[fontFamily] || fonts.default,
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <h1
          style={{
            fontSize: "2rem",
            color: themes[theme].primary,
            fontFamily: fonts[fontFamily],
            margin: 0,
            minWidth: "300px",
            fontWeight: "bold",
          }}
        >
          MyXRPL Defi
        </h1>
        <div
          style={{
            display: "flex",
            gap: "15px",
            fontSize: "0.9rem",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background:
                themes[theme]?.cardBackground || themes.blue.cardBackground,
              padding: "8px 12px",
              borderRadius: "20px",
              border: `1px solid ${
                themes[theme]?.border || themes.blue.border
              }`,
              fontWeight: "500",
              color: themes[theme]?.textSecondary || themes.blue.textSecondary,
            }}
          >
            Address: {accountAddress.substring(0, 4)}...
            {accountAddress.substring(accountAddress.length - 4)}
          </div>
          <div
            style={{
              background:
                themes[theme]?.cardBackground || themes.blue.cardBackground,
              padding: "8px 12px",
              borderRadius: "20px",
              border: `1px solid ${
                themes[theme]?.border || themes.blue.border
              }`,
              fontWeight: "500",
              color: themes[theme]?.textSecondary || themes.blue.textSecondary,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>Ledger: {ledgerIndex}</span>
            {hiddenPairs.size > 0 && (
              <button
                onClick={unhideAllPairs}
                style={{
                  background: "transparent",
                  color: themes[theme]?.secondary || themes.blue.secondary,
                  border: "none",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "0.85rem",
                  fontFamily: fonts[fontFamily] || fonts.default,
                  textDecoration: "underline",
                }}
                title="Unhide all trading pairs"
              >
                (Unhide All: {hiddenPairs.size})
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              localStorage.setItem("appTheme", e.target.value);
            }}
            style={{
              background: "#ffffff",
              color: "#000000",
              border: "1px solid #cccccc",
              borderRadius: "15px",
              padding: "5px 10px",
              fontSize: "0.85rem",
              cursor: "pointer",
              minWidth: "100px",
            }}
          >
            <option value="blue">Blue</option>
            <option value="purple">Purple</option>
            <option value="pink">Pink</option>
            <option value="orange">Orange</option>
            <option value="green">Green</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>
          <select
            value={fontFamily}
            onChange={(e) => {
              setFontFamily(e.target.value);
              localStorage.setItem("appFont", e.target.value);
            }}
            style={{
              background: "#ffffff",
              color: "#000000",
              border: "1px solid #cccccc",
              borderRadius: "15px",
              padding: "5px 10px",
              fontSize: "0.85rem",
              cursor: "pointer",
              minWidth: "120px",
            }}
          >
            <option value="cooperBlack">Cooper Black</option>
            <option value="comicSans">Comic Sans</option>
            <option value="tahoma">Tahoma</option>
          </select>
          <button
            onClick={handleLogout}
            style={{
              background: `linear-gradient(135deg, ${
                themes[theme]?.primary || themes.blue.primary
              }, ${themes[theme]?.secondary || themes.blue.secondary})`,
              color: themes[theme]?.text || themes.blue.text,
              border: `1px solid ${
                themes[theme]?.border || themes.blue.border
              }`,
              padding: "8px 15px",
              borderRadius: "25px",
              cursor: "pointer",
              fontWeight: "bold",
              textTransform: "uppercase",
              fontFamily: fonts[fontFamily] || fonts.default,
            }}
          >
            Disconnect
          </button>
        </div>
      </nav>
      <div
        style={{
          padding: "10px",
          height: "calc(100vh - 120px)",
        }}
      >
        <ResizableSplitView
          left={
            <TokenAnalyzer
              error={error}
              loadingTransactions={loadingTransactions}
              loadingProgress={loadingProgress}
              transactions={transactions}
              batchReverseLoading={batchReverseLoading}
              batchReverseProgress={batchReverseProgress}
              hiddenPairs={hiddenPairs}
              tokenPrices={tokenPrices}
              ledgerIndex={ledgerIndex}
              loadTransactions={loadTransactions}
              renderProgressBar={renderProgressBar}
              renderPriceUpdateProgress={renderPriceUpdateProgress}
              getPairKey={getPairKey}
              formatCurrencyCode={formatCurrencyCode}
              formatValueWithCommas={formatValueWithCommas}
              truncateAddress={truncateAddress}
              fetchComprehensiveTokenData={fetchComprehensiveTokenData}
              theme={theme}
              themes={themes}
              fontFamily={fontFamily}
              fonts={fonts}
              calculatePositionWithLivePrices={calculatePositionWithLivePrices}
              calculateReverseLatestPosition={calculateReverseLatestPosition}
              setHiddenPairs={setHiddenPairs}
              SwapCard={SwapCard}
            />
          }
          right={
            <div
              style={{
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {transactions.length > 0 ? (
                <>
                  <div
                    style={{
                      height: "100%",
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{ height: "30%", display: "flex", gap: "10px" }}
                    >
                      <div style={{ flex: "1", height: "100%" }}>
                        {transactions.length > 0 ? (
                          <SequentialSwaps
                            batchReverseLoading={batchReverseLoading}
                            arbitrageChains={arbitrageChains}
                            transactions={transactions}
                            reverseQuotes={reverseQuotes}
                            chainProfitThreshold={chainProfitThreshold}
                            setChainProfitThreshold={setChainProfitThreshold}
                            getSwapGroups={getSwapGroups}
                            findArbitrageChains={findArbitrageChains}
                            setArbitrageChains={setArbitrageChains}
                            themes={themes}
                            theme={theme}
                            fonts={fonts}
                            fontFamily={fontFamily}
                            hexToRgb={hexToRgb}
                            formatCurrencyCode={formatCurrencyCode}
                          />
                        ) : (
                          <div
                            style={{
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: themes[theme].textSecondary,
                              fontSize: "0.9rem",
                              background: themes[theme].cardBackground,
                              borderRadius: "15px",
                              border: `2px solid ${themes[theme].border}`,
                              padding: "20px",
                            }}
                          >
                            Sequential swaps will appear after loading
                            transactions
                          </div>
                        )}
                      </div>
                      <div style={{ flex: "1", height: "100%" }}>
                        {transactions.length > 0 ? (
                          renderFutureComponent()
                        ) : (
                          <div
                            style={{
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: themes[theme].textSecondary,
                              fontSize: "0.9rem",
                              background: themes[theme].cardBackground,
                              borderRadius: "15px",
                              border: `2px solid ${themes[theme].border}`,
                              padding: "20px",
                            }}
                          >
                            Token positions will appear after loading
                            transactions
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ height: "70%", width: "100%" }}>
                      <div
                        style={{
                          background: themes[theme].cardBackground,
                          borderRadius: "15px",
                          padding: "10px",
                          border: `2px solid ${themes[theme].border}`,
                          height: "100%",
                          boxShadow: `0 4px 15px rgba(${hexToRgb(
                            themes[theme].primary
                          )}, 0.2)`,
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          fontFamily: fonts[fontFamily],
                        }}
                      >
                        {/* Calculate visible pairs count */}
                        {(() => {
                          const visiblePairs = new Set();
                          transactions.forEach((swap) => {
                            const pairKey = getPairKey(
                              { currency: swap.c1, issuer: swap.i1 },
                              { currency: swap.c2, issuer: swap.i2 }
                            );
                            const containsXRP =
                              swap.c1 === "XRP" || swap.c2 === "XRP";
                            if (!hiddenPairs.has(pairKey) && !containsXRP) {
                              visiblePairs.add(pairKey);
                            }
                          });
                          const visiblePairsCount = visiblePairs.size;

                          return (
                            <>
                              <h3
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "bold",
                                  color: themes[theme].primary,
                                  textAlign: "center",
                                  marginBottom: "10px",
                                  fontFamily: fonts[fontFamily],
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span>
                                  📈 Tokens per XRP (Inverse of Price)
                                </span>
                                <span
                                  style={{
                                    fontSize: "1.5rem",
                                    color: themes[theme].textSecondary,
                                    fontWeight: "normal",
                                  }}
                                >
                                  Active Trading Pairs: {visiblePairsCount}
                                </span>
                              </h3>
                              <div
                                style={{
                                  flex: 1,
                                  minHeight: "200px",
                                  position: "relative",
                                  overflow: "hidden",
                                  width: "100%",
                                }}
                              >
                                <TokenChart
                                  selectedToken={selectedToken}
                                  tokenPrices={tokenPrices}
                                  theme={theme}
                                  themes={themes}
                                  fonts={fonts}
                                  fontFamily={fontFamily}
                                  isChartReady={true}
                                  transactions={transactions}
                                  visiblePairsCount={visiblePairsCount}
                                />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: themes[theme].textSecondary,
                    fontSize: "2.5rem",
                    background: themes[theme].cardBackground,
                    borderRadius: "15px",
                    border: `2px solid ${themes[theme].border}`,
                  }}
                >
                  Flip the Switch to analyze your swap history
                </div>
              )}
            </div>
          }
        />
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
          XRP The Standard - Everything will trade against XRP
        </p>
        <p style={{ fontSize: "0.7rem", color: "#475569", marginTop: "10px" }}>
          © {new Date().getFullYear()} MyXRPL Defi
        </p>
      </div>
    </div>
  );
}

export default App;

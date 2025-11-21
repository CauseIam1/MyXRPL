import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import PairsSection from "./components/PairsSection";
import {
  formatCurrencyCode,
  formatValueWithCommas,
  truncateAddress,
  getPairKey,
} from "./utils/formatters";
import TokenPositions from "./components/TokenPositions";
import TradingChart from "./components/TradingChart";
import PairsChart from "./components/PairsChart";
import SequentialSwaps from "./components/SequentialSwaps";
import TokenAnalyzer from "./components/TokenAnalyzer";
import { calculateRealizedProfitsByToken } from "./utils/tokenUtils";
import {
  CACHE_KEY_PREFIX,
  getLocalStorageUsage,
  isQuotaExceededError,
  cleanupOldCache,
  cleanupCacheAggressively,
} from "./utils/cacheUtils";
import {
  START_LEDGER,
  isTokenSwapTransaction,
  extractTokenSwapData,
  sortAndProcessTransactions,
  minimizeTransactionData,
  extractEssentialSwapData,
  serializeSwapGroups,
  deserializeSwapGroups,
} from "./utils/transactionUtils";
import {
  calculateReverseLatestPosition,
  calculateReverseQuote,
  calculatePositionWithLivePrices,
} from "./utils/priceUtils";
import { findArbitrageChains } from "./utils/arbitrageUtils";
import "./index.css";
const connectionSemaphore = {
  maxConnections: 3,
  activeConnections: 0,
  queue: [],
  async acquire() {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.activeConnections < this.maxConnections) {
          this.activeConnections++;
          resolve();
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  },
  release() {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      setTimeout(next, 10);
    }
  },
};

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
  const [reverseQuotes, setReverseQuotes] = useState({});
  const [batchReverseLoading, setBatchReverseLoading] = useState(false);
  const [batchReverseProgress, setBatchReverseProgress] = useState(0);
  const [hiddenPairs, setHiddenPairs] = useState(new Set());
  const [arbitrageChains, setArbitrageChains] = useState([]);
  const [filterSinceLogin, setFilterSinceLogin] = useState(false);
  const [loginLedger, setLoginLedger] = useState(START_LEDGER);
  const [tokenPrices, setTokenPrices] = useState({});
  const [chainProfitThreshold, setChainProfitThreshold] = useState(0.5);
  const [areTokenPositionsReady, setAreTokenPositionsReady] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("appTheme") || "ocean";
  });
  const [fontFamily, setFontFamily] = useState(() => {
    return localStorage.getItem("appFont") || "inter";
  });
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedPair, setSelectedPair] = useState(null);
  const [showPairChart, setShowPairChart] = useState(false);
  const [clearCacheOnDisconnect, setClearCacheOnDisconnect] = useState(() => {
    return localStorage.getItem("clearCacheOnDisconnect") === "true";
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [chartTimeRange, setChartTimeRange] = useState("7D");
  const swapGroupsRef = useRef([]);
  const wsRef = useRef(null);
  const loadingCancelledRef = useRef(false);
  const themes = useMemo(() => {
    return {
      ocean: {
        primary: "#00F5FF",
        secondary: "#0099FF",
        accent: "#00D4FF",
        background:
          "linear-gradient(135deg, #0A0F1F 0%, #0C1428 50%, #0A1A2F 100%)",
        cardBackground: "rgba(15, 25, 45, 0.6)",
        text: "#FFFFFF",
        textSecondary: "#A0B0D0",
        border: "rgba(0, 245, 255, 0.2)",
        success: "#00FF9D",
        danger: "#FF4D7D",
        warning: "#FFD166",
        glass: "rgba(15, 25, 45, 0.4)",
        glassBorder: "rgba(0, 245, 255, 0.1)",
      },
      sunset: {
        primary: "#FF6B6B",
        secondary: "#FF9E6B",
        accent: "#FFB366",
        background:
          "linear-gradient(135deg, #1A0F1F 0%, #2A0F28 50%, #1F0A2A 100%)",
        cardBackground: "rgba(30, 15, 35, 0.6)",
        text: "#FFFFFF",
        textSecondary: "#D0B0D0",
        border: "rgba(255, 107, 107, 0.2)",
        success: "#6BFF9E",
        danger: "#FF6B9E",
        warning: "#FFE66B",
        glass: "rgba(30, 15, 35, 0.4)",
        glassBorder: "rgba(255, 107, 107, 0.1)",
      },
      neon: {
        primary: "#E91E63",
        secondary: "#9C27B0",
        accent: "#673AB7",
        background:
          "linear-gradient(135deg, #0F0F1F 0%, #1A0A2A 50%, #0F0F2A 100%)",
        cardBackground: "rgba(20, 15, 40, 0.6)",
        text: "#FFFFFF",
        textSecondary: "#B0A0D0",
        border: "rgba(233, 30, 99, 0.2)",
        success: "#00E676",
        danger: "#FF4081",
        warning: "#FFEA00",
        glass: "rgba(20, 15, 40, 0.4)",
        glassBorder: "rgba(233, 30, 99, 0.1)",
      },
      forest: {
        primary: "#00E676",
        secondary: "#00BFA5",
        accent: "#00C853",
        background:
          "linear-gradient(135deg, #07120F 0%, #0A1A15 50%, #071A1A 100%)",
        cardBackground: "rgba(10, 25, 20, 0.6)",
        text: "#FFFFFF",
        textSecondary: "#A0C0B0",
        border: "rgba(0, 230, 118, 0.2)",
        success: "#76FF03",
        danger: "#FF5252",
        warning: "#FFC400",
        glass: "rgba(10, 25, 20, 0.4)",
        glassBorder: "rgba(0, 230,118, 0.1)",
      },
      cosmic: {
        primary: "#7C4DFF",
        secondary: "#536DFE",
        accent: "#3F51B5",
        background:
          "linear-gradient(135deg, #0F0F2A 0%, #0A0A2F 50%, #0F0F3A 100%)",
        cardBackground: "rgba(15, 15, 45, 0.6)",
        text: "#FFFFFF",
        textSecondary: "#B0B0D0",
        border: "rgba(124, 77, 255, 0.2)",
        success: "#18FFFF",
        danger: "#FF4081",
        warning: "#FFEB3B",
        glass: "rgba(15, 15, 45, 0.4)",
        glassBorder: "rgba(124, 77, 255, 0.1)",
      },
      midnight: {
        primary: "#64B5F6",
        secondary: "#42A5F5",
        accent: "#2196F3",
        background:
          "linear-gradient(135deg, #0A0A1F 0%, #0F0F2A 50%, #0A0A3A 100%)",
        cardBackground: "rgba(15, 15, 35, 0.6)",
        text: "#FFFFFF",
        textSecondary: "#A0A0C0",
        border: "rgba(100, 181, 246, 0.2)",
        success: "#69F0AE",
        danger: "#FF6E6E",
        warning: "#FFD740",
        glass: "rgba(15, 15, 35, 0.4)",
        glassBorder: "rgba(100, 181, 246, 0.1)",
      },
      lava: {
        primary: "#FF6B35",
        secondary: "#FF8C42",
        accent: "#FFA726",
        background:
          "linear-gradient(135deg, #1A0A0A 0%, #2A0F0F 50%, #1F0A0A 100%)",
        cardBackground: "rgba(35, 15, 15, 0.6)",
        text: "#FFFFFF",
        textSecondary: "#D0A0A0",
        border: "rgba(255, 107, 53, 0.2)",
        success: "#76FF03",
        danger: "#FF5252",
        warning: "#FFEB3B",
        glass: "rgba(35, 15, 15, 0.4)",
        glassBorder: "rgba(255, 107, 53, 0.1)",
      },
    };
  }, []);

  const fonts = useMemo(() => {
    return {
      inter:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      poppins: "'Poppins', 'Segoe UI', sans-serif",
      montserrat: "'Montserrat', 'Segoe UI', sans-serif",
      roboto: "'Roboto', 'Helvetica Neue', sans-serif",
    };
  }, []);

  const visiblePairs = useMemo(() => {
    const pairs = new Set();
    if (transactions && transactions.length > 0) {
      transactions.forEach((swap) => {
        const pairKey = getPairKey(
          { currency: swap.c1, issuer: swap.i1 },
          { currency: swap.c2, issuer: swap.i2 }
        );
        const containsXRP = swap.c1 === "XRP" || swap.c2 === "XRP";
        if (!hiddenPairs.has(pairKey) && !containsXRP) {
          pairs.add(pairKey);
        }
      });
    }
    return pairs;
  }, [transactions, hiddenPairs]);

  const visiblePairsCount = useMemo(() => {
    return visiblePairs.size;
  }, [visiblePairs]);

  const allTokens = useMemo(() => {
    if (transactions.length === 0) return [];
    const tokenData = calculateRealizedProfitsByToken(
      transactions,
      hiddenPairs,
      formatCurrencyCode,
      formatValueWithCommas
    );
    const profitableTokens = tokenData.profitable.map((token) => ({
      ...token,
      isDeficit: false,
    }));
    const deficitTokens = tokenData.deficit.map((token) => ({
      ...token,
      isDeficit: true,
    }));
    return profitableTokens.concat(deficitTokens).sort((a, b) => {
      if (!a.isDeficit && !b.isDeficit) {
        return b.totalNetAmount - a.totalNetAmount;
      }
      if (a.isDeficit && b.isDeficit) {
        return a.totalNetAmount - b.totalNetAmount;
      }
      return a.isDeficit ? 1 : -1;
    });
  }, [transactions, hiddenPairs, formatCurrencyCode, formatValueWithCommas]);

  const handleTokenSelect = useCallback(
    (token) => {
      if (
        token &&
        token.currency &&
        (token.issuer || token.currency === "XRP")
      ) {
        const priceKey = `${token.currency}-${token.issuer}`;
        if (tokenPrices[priceKey] !== undefined) {
          setSelectedToken(token);
          setShowPairChart(false);
        } else {
          setTimeout(() => {
            setSelectedToken(token);
            setShowPairChart(false);
          }, 1000);
        }
      }
    },
    [tokenPrices]
  );

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

  const unhideAllPairs = () => {
    setHiddenPairs(new Set());
    if (accountAddress) {
      const settings = {
        hiddenPairs: Array.from(hiddenPairs),
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
          background: `linear-gradient(135deg, ${themes[theme].glass}, ${themes[theme].glass})`,
          color: themes[theme].text,
          padding: "20px",
          borderRadius: "16px",
          margin: "15px 0",
          textAlign: "center",
          border: `1px solid ${themes[theme].glassBorder}`,
          fontSize: "0.9rem",
          fontFamily: fonts[fontFamily],
          backdropFilter: "blur(10px)",
          boxShadow: `0 8px 32px rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
          animation: "fadeIn 0.3s ease-out",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "8px",
            background: `rgba(${hexToRgb(themes[theme].primary)}, 0.15)`,
            borderRadius: "4px",
            margin: "0 auto 15px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${priceUpdateProgress}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
              borderRadius: "4px",
              transition: "width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
              boxShadow: `0 0 10px ${themes[theme].primary}`,
            }}
          ></div>
        </div>
        <p
          style={{
            fontFamily: fonts[fontFamily],
            margin: "0 0 8px 0",
            fontWeight: 500,
          }}
        >
          🔄 Updating token prices...
        </p>
        <p style={{ fontSize: "0.75rem", marginTop: "5px", opacity: 0.8 }}>
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
      if (groupedSwaps[pairKey].swaps.length < 100) {
        groupedSwaps[pairKey].swaps.push(swap);
      }
    });
    const swapGroups = Object.values(groupedSwaps).map((group) => {
      group.swaps.sort((a, b) => new Date(b.date) - new Date(a.date));
      if (group.swaps.length > 100) {
        group.swaps = group.swaps.slice(0, 100);
      }
      return group;
    });
    swapGroupsRef.current = swapGroups;
    return swapGroups;
  };

  const renderProgressBar = (progress, message) => (
    <div
      style={{
        background: `linear-gradient(135deg, ${themes[theme].glass}, ${themes[theme].glass})`,
        color: themes[theme].text,
        padding: "20px",
        borderRadius: "16px",
        margin: "15px 0",
        textAlign: "center",
        border: `1px solid ${themes[theme].glassBorder}`,
        fontSize: "0.9rem",
        fontFamily: fonts[fontFamily],
        backdropFilter: "blur(10px)",
        boxShadow: `0 8px 32px rgba(${hexToRgb(themes[theme].primary)}, 0.2)`,
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "8px",
          background: `rgba(${hexToRgb(themes[theme].primary)}, 0.15)`,
          borderRadius: "4px",
          margin: "0 auto 15px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
            borderRadius: "4px",
            transition: "width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: `0 0 10px ${themes[theme].primary}`,
          }}
        ></div>
      </div>
      <p
        style={{
          fontFamily: fonts[fontFamily],
          margin: "0 0 8px 0",
          fontWeight: 500,
        }}
      >
        {message}
      </p>
      <p style={{ fontSize: "0.75rem", marginTop: "5px", opacity: 0.8 }}>
        {progress}% complete
      </p>
    </div>
  );

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

  const initXRPL = () => {
    setError("");
    setLoadingProgress(0);
    loadingCancelledRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (xrplClient) {
      xrplClient.close();
    }
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
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ledgerClosed") {
            setLedgerIndex(data.ledger_index);
          }
        } catch (parseError) {
          console.warn("Error parsing WebSocket message:", parseError);
        }
      };
      client.onerror = (error) => {
        console.error("XRPL WebSocket error:", error);
        setError(
          "Failed to connect to XRPL. Please check your internet connection."
        );
      };
      client.onclose = (event) => {
        console.log("XRPL WebSocket closed:", event.code, event.reason);
        if (!loadingCancelledRef.current && isLoggedIn) {
          setTimeout(() => {
            console.log("Attempting to reconnect to XRPL...");
            initXRPL();
          }, 5000);
        }
      };
    } catch (err) {
      console.error("Failed to initialize XRPL connection:", err);
      setError("Failed to initialize XRPL connection.");
    }
  };

  const updateCachedSwapGroups = async (account, newTransactions) => {
    const swapCacheKey = `swap_groups_${account}`;
    const cachedData = localStorage.getItem(swapCacheKey);
    if (!cachedData) return;
    try {
      const parsedCache = JSON.parse(cachedData);
      const cachedGroups = deserializeSwapGroups(parsedCache.swapGroups || []);
      const { swaps: newSwaps } = sortAndProcessTransactions(newTransactions);
      const allSwaps = [...newSwaps, ...cachedGroups.flatMap((g) => g.swaps)];
      const uniqueSwaps = Array.from(
        new Map(allSwaps.map((swap) => [swap.hash, swap])).values()
      );
      const swapGroups = {};
      uniqueSwaps.forEach((swap) => {
        const pairKey = getPairKey(
          { currency: swap.c1, issuer: swap.i1 },
          { currency: swap.c2, issuer: swap.i2 }
        );
        if (!swapGroups[pairKey]) {
          swapGroups[pairKey] = {
            asset1: { currency: swap.c1, issuer: swap.i1 },
            asset2: { currency: swap.c2, issuer: swap.i2 },
            swaps: [],
          };
        }
        if (swapGroups[pairKey].swaps.length < 100) {
          swapGroups[pairKey].swaps.push(swap);
        }
      });
      const groupedSwaps = Object.values(swapGroups).map((group) => {
        group.swaps.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (group.swaps.length > 100) {
          group.swaps = group.swaps.slice(0, 100);
        }
        return group;
      });
      const swapCacheData = {
        swapGroups: serializeSwapGroups(groupedSwaps),
        lastLedger: ledgerIndex === "Loading..." ? START_LEDGER : ledgerIndex,
        timestamp: Date.now(),
        account: account,
      };
      localStorage.setItem(swapCacheKey, JSON.stringify(swapCacheData));
      return groupedSwaps;
    } catch (error) {
      console.error("Error updating cached swap groups:", error);
      return null;
    }
  };

  const loadTransactions = async (overrideFilterSinceLogin = null) => {
    try {
      const usage = getLocalStorageUsage();
      if (usage.usagePercent > 90) {
        console.warn("LocalStorage nearly full, cleaning up...");
        cleanupCacheAggressively();
      }
    } catch (e) {
      console.warn("Could not check localStorage usage:", e);
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
      const swapCacheKey = `swap_groups_${accountAddress}`;
      const cachedSwapData = localStorage.getItem(swapCacheKey);
      let cachedSwapGroups = [];
      let lastSwapUpdateLedger = START_LEDGER;
      if (cachedSwapData) {
        try {
          const parsedCache = JSON.parse(cachedSwapData);
          cachedSwapGroups = deserializeSwapGroups(
            parsedCache.swapGroups || []
          );
          lastSwapUpdateLedger = parsedCache.lastLedger || START_LEDGER;
        } catch (e) {
          console.warn("Failed to parse cached swap data:", e);
        }
      }
      const currentTime = Date.now();
      const cacheAge = cachedSwapData
        ? currentTime - JSON.parse(cachedSwapData).timestamp
        : Infinity;
      const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
      if (cachedSwapGroups.length > 0 && cacheAge < maxCacheAge) {
        setTransactions(cachedSwapGroups.flatMap((group) => group.swaps));
        setLoadingProgress(100);
        setTimeout(() => {
          setLoadingTransactions(false);
          setLoadingProgress(0);
        }, 500);
        return;
      }
      let cachedTransactions = [];
      let lastFullLoadLedger = START_LEDGER;
      const cachedTxData = localStorage.getItem(cacheKey);
      if (cachedTxData) {
        try {
          const parsedCache = JSON.parse(cachedTxData);
          cachedTransactions = parsedCache.transactions || [];
          lastFullLoadLedger = parsedCache.lastLedger || START_LEDGER;
        } catch (e) {
          console.warn("Failed to parse cached transaction data:", e);
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
          const swapGroups = {};
          swapTransactions.forEach((swap) => {
            const pairKey = getPairKey(
              { currency: swap.c1, issuer: swap.i1 },
              { currency: swap.c2, issuer: swap.i2 }
            );
            if (!swapGroups[pairKey]) {
              swapGroups[pairKey] = {
                asset1: { currency: swap.c1, issuer: swap.i1 },
                asset2: { currency: swap.c2, issuer: swap.i2 },
                swaps: [],
              };
            }
            if (swapGroups[pairKey].swaps.length < 100) {
              swapGroups[pairKey].swaps.push(swap);
            }
          });
          const groupedSwaps = Object.values(swapGroups).map((group) => {
            group.swaps.sort((a, b) => new Date(b.date) - new Date(a.date));
            if (group.swaps.length > 100) {
              group.swaps = group.swaps.slice(0, 100);
            }
            return group;
          });
          const swapCacheData = {
            swapGroups: serializeSwapGroups(groupedSwaps),
            lastLedger:
              ledgerIndex === "Loading..." ? lastFullLoadLedger : ledgerIndex,
            timestamp: Date.now(),
            account: accountAddress,
          };
          localStorage.setItem(swapCacheKey, JSON.stringify(swapCacheData));
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
              cacheData.transactions = cacheData.transactions.slice(-200);
            }
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
          } catch (e) {
            if (isQuotaExceededError(e)) {
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
                console.error(
                  "Failed to cache data after cleanup:",
                  retryError
                );
              }
            } else {
              console.error("Failed to cache data:", e);
            }
          }
          setLoadingProgress(90);
          setTransactions(swapTransactions);
        } catch (err) {
          console.error("Error processing transactions:", err);
          setError("Failed to process transactions: " + err.message);
        }
      }
      setLoadingProgress(100);
      setTimeout(() => {
        setLoadingTransactions(false);
        setLoadingProgress(0);
      }, 500);
    } catch (err) {
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
        ws.close();
        reject(error);
      };
    });
  };

  const fetchTokenXrpPrice = async (currency, issuer) => {
    if (currency === "XRP") return 1;
    if (!issuer) return null;
    await connectionSemaphore.acquire();
    try {
      const endpoints = [
        "wss://xrplcluster.com",
        "wss://s2.ripple.com:51233",
        "wss://xrpl.ws",
        "wss://s1.ripple.com:443",
      ];
      for (const endpoint of endpoints) {
        try {
          const ws = new WebSocket(endpoint);
          const result = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.close();
              }
              console.warn(`Timeout connecting to ${endpoint} for ${currency}`);
              resolve(null);
            }, 3000);
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
                fee_mult_max: 10000,
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
                    if (
                      data.result.amm.amount2 &&
                      data.result.amm.amount2.value
                    ) {
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
                  ws.close();
                  resolve(null);
                }
              } else {
                ws.close();
                resolve(null);
              }
            };
            ws.onerror = (error) => {
              clearTimeout(timeout);
              console.warn(`WebSocket error on ${endpoint}:`, error);
              if (ws.readyState === WebSocket.OPEN) {
                ws.close();
              }
              resolve(null);
            };
          });
          if (result !== null) {
            return result;
          }
        } catch (error) {
          console.warn(`Failed to connect to ${endpoint}:`, error.message);
          continue;
        }
      }
      console.warn(`Failed to fetch price for ${currency} on any endpoint`);
      return null;
    } finally {
      connectionSemaphore.release();
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

  const fetchComprehensiveTokenData = async (currencyCode, issuer) => {
    try {
      const accountInfo = await new Promise((resolve, reject) => {
        const ws = new WebSocket("wss://s1.ripple.com:443");
        const timeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
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
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
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

  const saveSwapGroupsToCache = (account, swapGroups) => {
    const swapCacheKey = `swap_groups_${account}`;
    try {
      const minimizedGroups = swapGroups.map((group) => ({
        ...group,
        swaps: group.swaps.slice(0, 10),
      }));
      const cacheData = {
        swapGroups: serializeSwapGroups(minimizedGroups),
        lastLedger: ledgerIndex === "Loading..." ? START_LEDGER : ledgerIndex,
        timestamp: Date.now(),
        account: account,
      };
      localStorage.setItem(swapCacheKey, JSON.stringify(cacheData));
    } catch (e) {
      if (isQuotaExceededError(e)) {
        console.warn("LocalStorage quota exceeded, cleaning up...");
        cleanupCacheAggressively();
        try {
          const minimalGroups = swapGroups.map((group) => ({
            ...group,
            swaps: group.swaps.slice(0, 5),
          }));
          const minimalCacheData = {
            swapGroups: serializeSwapGroups(minimalGroups),
            lastLedger:
              ledgerIndex === "Loading..." ? START_LEDGER : ledgerIndex,
            timestamp: Date.now(),
          };
          localStorage.setItem(swapCacheKey, JSON.stringify(minimalCacheData));
        } catch (retryError) {
          console.error("Failed to cache even with minimal data:", retryError);
        }
      } else {
        console.error("Failed to save cache:", e);
      }
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
      return null;
    }
  };

  const fetchAllTokenPrices = async () => {
    if (transactions.length === 0) return;
    if (isUpdatingPrices) return;
    setIsUpdatingPrices(true);
    setPriceUpdateProgress(0);
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
    const tokenMap = {};
    transactions.forEach((swap) => {
      const pairKey = getPairKey(
        { currency: swap.c1, issuer: swap.i1 },
        { currency: swap.c2, issuer: swap.i2 }
      );
      if (visiblePairs.has(pairKey)) {
        if (swap.c1 !== "XRP") {
          const key = `${swap.c1}-${swap.i1}`;
          if (!tokenMap[key]) {
            tokenMap[key] = { currency: swap.c1, issuer: swap.i1 };
          }
        }
        if (swap.c2 !== "XRP") {
          const key = `${swap.c2}-${swap.i2}`;
          if (!tokenMap[key]) {
            tokenMap[key] = { currency: swap.c2, issuer: swap.i2 };
          }
        }
      }
    });
    const updatedPrices = { ...tokenPrices };
    const tokensToFetch = Object.values(tokenMap);
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
            updatedPrices[priceKey] = null;
          }
        } catch (error) {
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
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    if (xrplClient && xrplClient.readyState === WebSocket.OPEN) {
      xrplClient.close();
    }
    if (clearCacheOnDisconnect) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith(CACHE_KEY_PREFIX) ||
              key.startsWith("chart_data_cache_") ||
              key.startsWith("chart_pair_data_cache_") ||
              key.startsWith("userSettings_") ||
              key.startsWith("swap_groups_") ||
              key === "walletLoginStats")
          ) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        console.warn("Error clearing cache:", e);
      }
    }
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
    setSelectedPair(null);
    setShowPairChart(false);
    setSelectedToken(null);
  };

  useEffect(() => {
    cleanupOldCache();
  }, []);

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
        } catch (error) {}
      }
    }
  }, [accountAddress]);

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
    setAreTokenPositionsReady(false);
    setSelectedToken(null);
  }, [transactions]);

  useEffect(() => {
    if (transactions.length > 0 && Object.keys(tokenPrices).length === 0) {
      fetchAllTokenPrices();
    }
  }, [transactions]);

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

  useEffect(() => {
    const usage = getLocalStorageUsage();

    if (usage.usagePercent > 80) {
      cleanupCacheAggressively();
    }
  }, [transactions.length]);

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
        const chains = findArbitrageChains(
          swapGroups,
          reverseQuotes,
          hiddenPairs,
          chainProfitThreshold
        );
        setArbitrageChains(chains);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [
    transactions,
    reverseQuotes,
    batchReverseLoading,
    hiddenPairs,
    chainProfitThreshold,
  ]);

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
        if (groupedSwaps[pairKey].swaps.length < 100) {
          groupedSwaps[pairKey].swaps.push(swap);
        }
      });
      Object.values(groupedSwaps).forEach((group) => {
        if (group.swaps.length > 0) {
          const latestSwap = group.swaps[0];
          const pairKey = getPairKey(group.asset1, group.asset2);
          const reverseQuote = calculateReverseQuote(
            latestSwap,
            null,
            tokenPrices
          );
          newReverseQuotes[pairKey] = reverseQuote;
        }
      });
      setReverseQuotes(newReverseQuotes);
    }
  }, [transactions, tokenPrices, batchReverseLoading]);
  useEffect(() => {
    if (!transactions.length || loadingTransactions || batchReverseLoading) {
      return;
    }
    const interval = setInterval(async () => {
      if (accountAddress && ledgerIndex !== "Loading...") {
        try {
          const swapCacheKey = `swap_groups_${accountAddress}`;
          const cachedData = localStorage.getItem(swapCacheKey);
          if (cachedData) {
            const parsedCache = JSON.parse(cachedData);
            const lastLedger = parsedCache.lastLedger || START_LEDGER;
            if (lastLedger < ledgerIndex) {
              const newTransactions = await fetchTransactionsSince(
                accountAddress,
                lastLedger,
                ledgerIndex
              );
              if (newTransactions.length > 0) {
                const updatedGroups = await updateCachedSwapGroups(
                  accountAddress,
                  newTransactions
                );
                if (updatedGroups) {
                  setTransactions(
                    updatedGroups.flatMap((group) => group.swaps)
                  );
                }
              }
            }
          }
        } catch (error) {
          console.error("Error in periodic update:", error);
        }
      }
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

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      try {
        const usage = getLocalStorageUsage();
        if (usage.usagePercent > 70) {
          console.log("High localStorage usage, cleaning cache...");
          cleanupCacheAggressively();
        }
      } catch (e) {
        console.warn("Cache monitoring failed:", e);
      }
    }, 300000);

    return () => clearInterval(cleanupInterval);
  }, []);

  useEffect(() => {
    cleanupOldCache();
    return () => {
      loadingCancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      loadingCancelledRef.current = true;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      if (xrplClient && xrplClient.readyState === WebSocket.OPEN) {
        xrplClient.close();
      }
    };
  }, []);

  if (!isLoggedIn) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          background: themes[theme].background,
          fontFamily: fonts[fontFamily],
          margin: 0,
          padding: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: `
              radial-gradient(circle at 20% 30%, ${themes[theme].primary}10 0%, transparent 40%),
              radial-gradient(circle at 80% 70%, ${themes[theme].secondary}10 0%, transparent 40%)
            `,
            animation: "float 20s ease-in-out infinite",
            zIndex: 0,
          }}
        />
        <div
          style={{
            background: `linear-gradient(135deg, ${themes[theme].glass}, ${themes[theme].glass})`,
            padding: "40px",
            borderRadius: "24px",
            boxShadow: `0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px ${themes[theme].primary}20`,
            textAlign: "center",
            maxWidth: "500px",
            width: "90%",
            border: `1px solid ${themes[theme].glassBorder}`,
            position: "relative",
            backdropFilter: "blur(20px)",
            zIndex: 1,
            animation: "fadeIn 0.6s ease-out",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-50px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "100px",
              height: "100px",
              background: `linear-gradient(135deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "3rem",
              boxShadow: `0 10px 30px ${themes[theme].primary}40`,
              zIndex: 2,
            }}
          >
            🚀
          </div>
          <h2
            style={{
              marginTop: "40px",
              marginBottom: "20px",
              color: themes[theme].text,
              fontSize: "2.5rem",
              fontWeight: 800,
              background: `linear-gradient(45deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: fonts[fontFamily],
            }}
          >
            MyXRPL DeFi
          </h2>
          <div
            style={{
              background: themes[theme].glass,
              border: `1px solid ${themes[theme].glassBorder}`,
              borderRadius: "16px",
              padding: "20px",
              marginBottom: "25px",
              backdropFilter: "blur(10px)",
            }}
          >
            <h3
              style={{
                color: themes[theme].secondary,
                marginBottom: "10px",
                fontSize: "1.2rem",
                fontWeight: 600,
              }}
            >
              Swap Assets for Assets
            </h3>
            <p
              style={{
                marginBottom: "0",
                lineHeight: "1.6",
                fontSize: "1rem",
                color: themes[theme].textSecondary,
                fontWeight: 500,
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
              padding: "18px 20px",
              margin: "15px 0",
              border: `2px solid ${themes[theme].glassBorder}`,
              borderRadius: "12px",
              fontSize: "1rem",
              background: themes[theme].glass,
              color: themes[theme].text,
              fontWeight: 500,
              fontFamily: fonts[fontFamily],
              transition: "all 0.3s ease",
              outline: "none",
            }}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleLogin(e.target.value.trim());
              }
            }}
            onFocus={(e) => {
              e.target.style.borderColor = themes[theme].primary;
              e.target.style.boxShadow = `0 0 0 3px ${themes[theme].primary}30`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = themes[theme].glassBorder;
              e.target.style.boxShadow = "none";
            }}
          />
          <button
            onClick={(e) => {
              const input = document.querySelector("input");
              if (input) {
                handleLogin(input.value.trim());
              }
            }}
            style={{
              background: `linear-gradient(135deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
              color: themes[theme].text,
              border: "none",
              padding: "18px 30px",
              fontSize: "1.1rem",
              borderRadius: "12px",
              cursor: "pointer",
              marginTop: "15px",
              width: "100%",
              fontWeight: 700,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              boxShadow: `0 10px 25px ${themes[theme].primary}40`,
              transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              position: "relative",
              overflow: "hidden",
              fontFamily: fonts[fontFamily],
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-3px) scale(1.02)";
              e.target.style.boxShadow = `0 15px 35px ${themes[theme].primary}60`;
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0) scale(1)";
              e.target.style.boxShadow = `0 10px 25px ${themes[theme].primary}40`;
            }}
          >
            <span style={{ position: "relative", zIndex: 1 }}>Go Time</span>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "-100%",
                width: "100%",
                height: "100%",
                background: `linear-gradient(90deg, transparent, ${themes[theme].accent}, transparent)`,
                transition: "left 0.7s",
              }}
              className="button-shine"
            />
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
        overflowX: "hidden",
      }}
      role="main"
      aria-label="MyXRPL DeFi"
    >
      {/* Modern glassmorphism navbar */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          background: `linear-gradient(135deg, ${themes[theme].glass}, ${themes[theme].glass})`,
          color: themes[theme].text,
          padding: "15px 20px",
          boxShadow: `0 4px 30px rgba(0, 0, 0, 0.3)`,
          zIndex: 1000,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${themes[theme].glassBorder}`,
          margin: 0,
          fontFamily: fonts[fontFamily],
          flexWrap: "wrap",
          gap: "10px",
          backdropFilter: "blur(20px)",
        }}
      >
        <h1
          style={{
            fontSize: "1.8rem",
            color: themes[theme].primary,
            fontFamily: fonts[fontFamily],
            margin: 0,
            minWidth: "200px",
            fontWeight: 800,
            textShadow: `0 0 10px ${themes[theme].primary}40`,
          }}
        >
          MyXRPL DeFi
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
              background: themes[theme].glass,
              padding: "8px 16px",
              borderRadius: "20px",
              border: `1px solid ${themes[theme].glassBorder}`,
              fontWeight: 500,
              color: themes[theme].textSecondary,
              backdropFilter: "blur(10px)",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = `0 5px 15px ${themes[theme].primary}20`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <span style={{ fontWeight: 700, color: themes[theme].primary }}>
              {accountAddress.substring(0, 4)}...
              {accountAddress.substring(accountAddress.length - 4)}
            </span>
          </div>

          <div
            style={{
              background: themes[theme].glass,
              padding: "8px 16px",
              borderRadius: "20px",
              border: `1px solid ${themes[theme].glassBorder}`,
              fontWeight: 500,
              color: themes[theme].textSecondary,
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = `0 5px 15px ${themes[theme].primary}20`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <span>Ledger</span>
            <span style={{ fontWeight: 700, color: themes[theme].primary }}>
              {ledgerIndex}
            </span>
            {hiddenPairs.size > 0 && (
              <button
                onClick={unhideAllPairs}
                style={{
                  background: "transparent",
                  color: themes[theme].secondary,
                  border: "none",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "0.8rem",
                  marginLeft: "8px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = `rgba(${hexToRgb(
                    themes[theme].secondary
                  )}, 0.2)`;
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "transparent";
                }}
                title="Unhide all trading pairs"
              >
                Unhide {hiddenPairs.size}
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
              background: themes[theme].glass,
              color: themes[theme].text,
              border: `1px solid ${themes[theme].glassBorder}`,
              borderRadius: "12px",
              padding: "8px 12px",
              fontSize: "0.85rem",
              cursor: "pointer",
              minWidth: "100px",
              fontFamily: fonts[fontFamily],
              backdropFilter: "blur(10px)",
              transition: "all 0.3s ease",
            }}
          >
            <option value="ocean">Ocean</option>
            <option value="sunset">Sunset</option>
            <option value="neon">Neon</option>
            <option value="forest">Forest</option>
            <option value="cosmic">Cosmic</option>
            <option value="midnight">Midnight</option>
            <option value="lava">Lava</option>
          </select>

          <select
            value={fontFamily}
            onChange={(e) => {
              setFontFamily(e.target.value);
              localStorage.setItem("appFont", e.target.value);
            }}
            style={{
              background: themes[theme].glass,
              color: themes[theme].text,
              border: `1px solid ${themes[theme].glassBorder}`,
              borderRadius: "12px",
              padding: "8px 12px",
              fontSize: "0.85rem",
              cursor: "pointer",
              minWidth: "120px",
              fontFamily: fonts[fontFamily],
              backdropFilter: "blur(10px)",
              transition: "all 0.3s ease",
            }}
          >
            <option value="inter">Inter</option>
            <option value="poppins">Poppins</option>
            <option value="montserrat">Montserrat</option>
            <option value="roboto">Roboto</option>
          </select>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: themes[theme].glass,
              border: `1px solid ${themes[theme].glassBorder}`,
              borderRadius: "12px",
              padding: "6px 12px",
              backdropFilter: "blur(10px)",
            }}
          >
            <span
              style={{
                fontSize: "0.8rem",
                color: themes[theme].textSecondary,
                fontWeight: 500,
              }}
            >
              Clear Cache
            </span>
            <button
              onClick={() => {
                const newValue = !clearCacheOnDisconnect;
                setClearCacheOnDisconnect(newValue);
                localStorage.setItem(
                  "clearCacheOnDisconnect",
                  newValue.toString()
                );
              }}
              style={{
                width: "40px",
                height: "20px",
                background: clearCacheOnDisconnect
                  ? themes[theme].primary
                  : themes[theme].glass,
                border: `1px solid ${themes[theme].glassBorder}`,
                borderRadius: "10px",
                position: "relative",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "2px",
                  left: clearCacheOnDisconnect ? "20px" : "2px",
                  width: "14px",
                  height: "14px",
                  background: themes[theme].text,
                  borderRadius: "50%",
                  transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            </button>
          </div>

          <button
            onClick={handleLogout}
            style={{
              background: `linear-gradient(135deg, ${themes[theme].danger}, ${themes[theme].danger}aa)`,
              color: themes[theme].text,
              border: `1px solid ${themes[theme].glassBorder}`,
              padding: "8px 16px",
              borderRadius: "12px",
              cursor: "pointer",
              fontWeight: 600,
              textTransform: "uppercase",
              fontFamily: fonts[fontFamily],
              transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              boxShadow: `0 4px 15px ${themes[theme].danger}30`,
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-2px) scale(1.05)";
              e.target.style.boxShadow = `0 8px 20px ${themes[theme].danger}50`;
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0) scale(1)";
              e.target.style.boxShadow = `0 4px 15px ${themes[theme].danger}30`;
            }}
          >
            Disconnect
          </button>
        </div>
      </nav>

      {/* NEW LAYOUT */}
      <div
        style={{
          padding: "20px",
          height: "calc(100vh - 120px)",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
        }}
      >
        {/* TOP SECTION */}
        <div
          style={{
            flex: "0 0 50%",
            display: "flex",
            gap: "15px",
            minHeight: 0,
          }}
        >
          {/* LEFT: Token Analyzer (Pairs List) */}
          <div
            style={{
              flex: 1,
              height: "100%",
              minHeight: 0,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
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
              PairsSection={PairsSection}
              setSelectedPair={setSelectedPair}
              setShowPairChart={setShowPairChart}
            />
          </div>

          {/* RIGHT: Sequential Swaps & Token Positions stacked */}
          <div
            style={{
              flex: 1,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              minHeight: 0,
            }}
          >
            {/* SEQUENTIAL SWAPS */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <SequentialSwaps
                batchReverseLoading={batchReverseLoading}
                arbitrageChains={arbitrageChains}
                transactions={transactions}
                reverseQuotes={reverseQuotes}
                chainProfitThreshold={chainProfitThreshold}
                setChainProfitThreshold={setChainProfitThreshold}
                getSwapGroups={getSwapGroups}
                findArbitrageChains={(swapGroups, reverseQuotes) =>
                  findArbitrageChains(
                    swapGroups,
                    reverseQuotes,
                    hiddenPairs,
                    chainProfitThreshold
                  )
                }
                setArbitrageChains={setArbitrageChains}
                themes={themes}
                theme={theme}
                fonts={fonts}
                fontFamily={fontFamily}
                hexToRgb={hexToRgb}
                formatCurrencyCode={formatCurrencyCode}
              />
            </div>
            {/* TOKEN POSITIONS - FIXED */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {transactions.length > 0 ? (
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
              ) : null}
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION - CHART */}
        <div
          style={{
            flex: "0 0 50%",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div
            id="token-chart-root"
            style={{
              width: "100%",
              height: "100%",
              minHeight: "400px",
              minWidth: "350px",
              display: "flex",
              flexDirection: "column",
              background: themes[theme].cardBackground,
              borderRadius: "16px",
              border: `1px solid ${themes[theme].glassBorder}`,
              boxShadow: `0 8px 32px rgba(${hexToRgb(
                themes[theme].primary
              )}, 0.2)`,
              fontFamily: fonts[fontFamily],
              backdropFilter: "blur(10px)",
              overflow: "hidden",
            }}
          >
            {transactions.length > 0 ? (
              <>
                <h3
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: themes[theme].primary,
                    textAlign: "center",
                    marginBottom: "10px",
                    fontFamily: fonts[fontFamily],
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "15px 20px 0",
                    flexShrink: 0,
                  }}
                >
                  {showPairChart &&
                  selectedPair &&
                  selectedPair.currency1 &&
                  selectedPair.currency2 ? (
                    <>
                      <span>
                        📈 {formatCurrencyCode(selectedPair.currency1)}/
                        {formatCurrencyCode(selectedPair.currency2)}
                      </span>
                      <span
                        style={{
                          fontSize: "1.2rem",
                          color: themes[theme].textSecondary,
                          fontWeight: 500,
                        }}
                      >
                        Active Pairs: {visiblePairsCount}
                      </span>
                    </>
                  ) : selectedToken && selectedToken.currency ? (
                    <>
                      <span>
                        📈 {formatCurrencyCode(selectedToken.currency)} per XRP
                      </span>
                      <span
                        style={{
                          fontSize: "1.2rem",
                          color: themes[theme].textSecondary,
                          fontWeight: 500,
                        }}
                      >
                        Active Pairs: {visiblePairsCount}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>📈 Assets per XRP</span>
                      <span
                        style={{
                          fontSize: "1.2rem",
                          color: themes[theme].textSecondary,
                          fontWeight: 500,
                        }}
                      >
                        Active Pairs: {visiblePairsCount}
                      </span>
                    </>
                  )}
                </h3>

                {/* CHART CONTAINER */}
                <div
                  style={{
                    flex: 1,
                    width: "100%",
                    minHeight: 0,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {showPairChart &&
                  selectedPair &&
                  selectedPair.currency1 &&
                  selectedPair.currency2 ? (
                    <PairsChart
                      key={`pair-${selectedPair.currency1}-${selectedPair.issuer1}-${selectedPair.currency2}-${selectedPair.issuer2}`}
                      selectedPair={selectedPair}
                      tokenPrices={tokenPrices}
                      theme={theme}
                      themes={themes}
                      fonts={fonts}
                      fontFamily={fontFamily}
                      timeRange={chartTimeRange}
                      onTimeRangeChange={setChartTimeRange}
                    />
                  ) : selectedToken && selectedToken.currency ? (
                    <TradingChart
                      key={`token-${selectedToken?.currency}-${selectedToken?.issuer}`}
                      selectedToken={selectedToken}
                      tokenPrices={tokenPrices}
                      theme={theme}
                      themes={themes}
                      fonts={fonts}
                      fontFamily={fontFamily}
                      transactions={transactions}
                      visiblePairsCount={visiblePairsCount}
                      timeRange={chartTimeRange}
                      onTimeRangeChange={setChartTimeRange}
                    />
                  ) : (
                    <div
                      style={{
                        height: "100%",
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: themes[theme].cardBackground,
                        borderRadius: "16px",
                        border: `1px solid ${themes[theme].glassBorder}`,
                        color: themes[theme].textSecondary,
                        fontFamily: fonts[fontFamily],
                        fontSize: "0.9rem",
                        textAlign: "center",
                        padding: "20px",
                        minHeight: "400px",
                        minWidth: "350px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "2rem", marginBottom: "10px" }}>
                          📊
                        </div>
                        <div>Select a token or pair to view chart</div>
                      </div>
                    </div>
                  )}
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
                  fontSize: "1.8rem",
                  textAlign: "center",
                  padding: "20px",
                  fontWeight: 600,
                }}
              >
                <div>
                  <div style={{ marginBottom: "20px", fontSize: "3rem" }}>
                    🎯
                  </div>
                  <div>Flip the Switch to analyze your swap history</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modern footer */}
      <div
        style={{
          textAlign: "center",
          padding: "20px 0",
          color: themes[theme].textSecondary,
          fontSize: "0.9rem",
          fontWeight: 500,
          background: themes[theme].glass,
          borderTop: `1px solid ${themes[theme].glassBorder}`,
          backdropFilter: "blur(10px)",
        }}
      >
        <p
          style={{
            marginBottom: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
          }}
        >
          <span>Built for the future of finance</span>
          <span style={{ color: themes[theme].primary }}>•</span>
          <a
            href="https://github.com/CauseIam1/MyXRPL"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: themes[theme].secondary,
              textDecoration: "none",
              fontWeight: 600,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.color = themes[theme].primary;
              e.target.style.textShadow = `0 0 10px ${themes[theme].primary}40`;
            }}
            onMouseLeave={(e) => {
              e.target.style.color = themes[theme].secondary;
              e.target.style.textShadow = "none";
            }}
          >
            GitHub
          </a>
        </p>
        <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
          XRP The Standard • Everything will trade against XRP
        </p>
        <p style={{ fontSize: "0.7rem", marginTop: "10px", opacity: 0.5 }}>
          © {new Date().getFullYear()} MyXRPL DeFi
        </p>
      </div>
    </div>
  );
}

export default App;

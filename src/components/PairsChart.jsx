import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  fetchChartData,
  processChartData,
  calculateStats,
} from "./pairsChart.data";
import {
  formatCurrencyCode,
  formatYAxisTick,
  formatNumber,
  hexToRgb,
  determineBaseCurrency,
  cleanupOldCache,
} from "./pairsChart.utils";

if (process.env.NODE_ENV === "development") {
  const originalWarn = console.warn;
  console.warn = function (...args) {
    if (
      args[0] &&
      typeof args[0] === "string" &&
      args[0].includes("The width(-1) and height(-1) of chart")
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

const PairsChart = ({
  selectedPair,
  tokenPrices,
  theme,
  themes,
  fonts,
  fontFamily,
}) => {
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState("30D");
  const [chartType, setChartType] = useState("area");
  const [stats, setStats] = useState({
    current: 0,
    high: 0,
    low: 0,
    change24h: 0,
    volume: 0,
  });
  const [progress, setProgress] = useState({ message: "", percent: 0 });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [useLogScale, setUseLogScale] = useState(false);

  const refreshIntervalRef = useRef(null);
  const chartContainerRef = useRef(null);

  const [rawTransactions, setRawTransactions] = useState([]);
  const [lastFetchedPair, setLastFetchedPair] = useState(null);
  const [baseCurrency, setBaseCurrency] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [isAsset1Base, setIsAsset1Base] = useState(true);

  const chartColors = useMemo(() => {
    const primary = themes[theme].primary;
    return {
      gradientStart: primary,
      gradientEnd: `${primary}00`,
      line: primary,
      grid: `${themes[theme].textSecondary}20`,
      text: themes[theme].textSecondary,
      volume: `${themes[theme].secondary}40`,
    };
  }, [theme, themes]);

  const yDomain = useMemo(() => {
    if (!chartData.length) return useLogScale ? [0.0000000001, 1] : [0, 1];

    const values = chartData.map((d) => d.quotePerBase);
    const sortedValues = [...values].sort((a, b) => a - b);

    const removeCount = Math.floor(sortedValues.length * 0.01);
    const filteredValues = sortedValues.slice(
      removeCount,
      sortedValues.length - removeCount
    );

    if (filteredValues.length === 0) {
      return useLogScale ? [0.0000000001, 1] : [0, 1];
    }

    let min = Math.min(...filteredValues);
    let max = Math.max(...filteredValues);

    if (min === max) {
      const padding = min * 0.1;
      min = Math.max(min - padding, 0);
      max = max + padding;
    }

    if (useLogScale) {
      min = min > 0 ? min * 0.9 : 0.0000000001;
      if (max <= min) max = min * 10;
    } else {
      min = Math.max(0, min * 0.9);
      max = max * 1.1;
    }

    if (!isFinite(min) || !isFinite(max) || min < 0 || max <= 0) {
      return useLogScale ? [0.0000000001, 1] : [0, 1];
    }

    return [min, max];
  }, [chartData, useLogScale]);

  useEffect(() => {
    cleanupOldCache();

    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        if (selectedPair?.currency1 && selectedPair?.currency2) {
          setLastFetchedPair(null);
          loadChartData();
        }
      }, 120000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedPair?.currency1, selectedPair?.currency2]);

  const loadChartData = useCallback(async () => {
    if (
      !selectedPair?.currency1 ||
      !selectedPair?.issuer1 ||
      !selectedPair?.currency2 ||
      !selectedPair?.issuer2
    ) {
      setChartData([]);
      return;
    }

    const pairKey = `${selectedPair.currency1}-${selectedPair.issuer1}→${selectedPair.currency2}-${selectedPair.issuer2}`;
    const cached = localStorage.getItem(`chart_pair_data_cache_raw_${pairKey}`);

    const asset1IsBase = determineBaseCurrency(selectedPair, tokenPrices);
    setIsAsset1Base(asset1IsBase);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.expires > Date.now()) {
          setRawTransactions(parsed.data);
          setLastFetchedPair(pairKey);

          if (asset1IsBase) {
            setBaseCurrency(formatCurrencyCode(selectedPair.currency1));
            setQuoteCurrency(formatCurrencyCode(selectedPair.currency2));
            setPriceLabel(
              `${formatCurrencyCode(
                selectedPair.currency2
              )} per ${formatCurrencyCode(selectedPair.currency1)}`
            );
          } else {
            setBaseCurrency(formatCurrencyCode(selectedPair.currency2));
            setQuoteCurrency(formatCurrencyCode(selectedPair.currency1));
            setPriceLabel(
              `${formatCurrencyCode(
                selectedPair.currency1
              )} per ${formatCurrencyCode(selectedPair.currency2)}`
            );
          }

          const processed = processChartData(
            parsed.data,
            asset1IsBase,
            timeRange
          );
          setChartData(processed);
          setStats(calculateStats(processed));
          return;
        } else {
          localStorage.removeItem(`chart_pair_data_cache_raw_${pairKey}`);
        }
      } catch (e) {
        // Silent cache read error
      }
    }

    setIsLoading(true);
    setError(null);
    setProgress({ message: "Searching for AMM pool...", percent: 0 });

    try {
      const result = await fetchChartData(
        selectedPair.currency1,
        selectedPair.issuer1,
        selectedPair.currency2,
        selectedPair.issuer2,
        tokenPrices,
        setProgress
      );

      if (result.error) {
        throw new Error(result.error);
      }

      const { ammData, asset1IsBase: determinedAsset1IsBase } = result;

      setRawTransactions(ammData);
      setLastFetchedPair(pairKey);

      try {
        const cacheData = {
          data: ammData,
          timestamp: Date.now(),
          expires: Date.now() + 24 * 60 * 60 * 1000,
        };
        localStorage.setItem(
          `chart_pair_data_cache_raw_${pairKey}`,
          JSON.stringify(cacheData)
        );
      } catch (e) {
        // Silent cache write error
      }

      if (determinedAsset1IsBase) {
        setBaseCurrency(formatCurrencyCode(selectedPair.currency1));
        setQuoteCurrency(formatCurrencyCode(selectedPair.currency2));
        setPriceLabel(
          `${formatCurrencyCode(
            selectedPair.currency2
          )} per ${formatCurrencyCode(selectedPair.currency1)}`
        );
      } else {
        setBaseCurrency(formatCurrencyCode(selectedPair.currency2));
        setQuoteCurrency(formatCurrencyCode(selectedPair.currency1));
        setPriceLabel(
          `${formatCurrencyCode(
            selectedPair.currency1
          )} per ${formatCurrencyCode(selectedPair.currency2)}`
        );
      }

      const processed = processChartData(
        ammData,
        determinedAsset1IsBase,
        timeRange
      );
      setChartData(processed);
      setStats(calculateStats(processed));

      setProgress({ message: "Complete!", percent: 100 });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setTimeout(() => setProgress({ message: "", percent: 0 }), 500);
    }
  }, [selectedPair, tokenPrices, timeRange]);

  useEffect(() => {
    if (selectedPair?.currency1 && selectedPair?.currency2) {
      const pairKey = `${selectedPair.currency1}-${selectedPair.issuer1}→${selectedPair.currency2}-${selectedPair.issuer2}`;

      if (lastFetchedPair === pairKey && rawTransactions.length > 0) {
        const asset1IsBase = determineBaseCurrency(selectedPair, tokenPrices);
        const processed = processChartData(
          rawTransactions,
          asset1IsBase,
          timeRange
        );
        setChartData(processed);
        setStats(calculateStats(processed));
      } else {
        loadChartData();
      }
    }
  }, [
    selectedPair?.currency1,
    selectedPair?.currency2,
    loadChartData,
    timeRange,
  ]);

  useEffect(() => {
    if (rawTransactions.length > 0) {
      const asset1IsBase = determineBaseCurrency(selectedPair, tokenPrices);
      const processed = processChartData(
        rawTransactions,
        asset1IsBase,
        timeRange
      );
      setChartData(processed);
      setStats(calculateStats(processed));
    }
  }, [timeRange, rawTransactions, selectedPair, tokenPrices]);

  useEffect(() => {
    setTimeRange("30D");
  }, [selectedPair?.currency1, selectedPair?.currency2]);

  // EARLY RETURN GUARD
  if (
    !selectedPair ||
    !selectedPair.currency1 ||
    !selectedPair.issuer1 ||
    !selectedPair.currency2 ||
    !selectedPair.issuer2
  ) {
    return (
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
          <div style={{ fontSize: "2rem", marginBottom: "10px" }}>📈</div>
          <div>Select an asset pair to view chart</div>
        </div>
      </div>
    );
  }

  // JSX RENDERING
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          style={{
            background: themes[theme].cardBackground,
            border: `1px solid ${themes[theme].border}`,
            borderRadius: "8px",
            padding: "12px",
            color: themes[theme].text,
            fontFamily: fonts[fontFamily],
            fontSize: "0.85rem",
            boxShadow: `0 4px 15px rgba(${hexToRgb(
              themes[theme].primary
            )}, 0.2)`,
          }}
        >
          <div
            style={{
              color: themes[theme].primary,
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            {new Date(data.time).toLocaleDateString()}{" "}
            {new Date(data.time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div>
            {priceLabel}:{" "}
            <span style={{ color: themes[theme].secondary, fontWeight: 600 }}>
              {formatNumber(data.quotePerBase, 8)}
            </span>
          </div>
          <div>
            Inverse:{" "}
            <span style={{ color: themes[theme].textSecondary }}>
              {formatNumber(data.basePerQuote, 8)}
            </span>
          </div>
          <div>
            Volume:{" "}
            <span style={{ color: themes[theme].textSecondary }}>
              {formatNumber(data.volume, 4)} {quoteCurrency}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        style={{
          height: "500px",
          width: "100%",
          minHeight: "500px",
          minWidth: "350px",
          display: "flex",
          flexDirection: "column",
          background: themes[theme].cardBackground,
          borderRadius: "16px",
          border: `1px solid ${themes[theme].glassBorder}`,
          backdropFilter: "blur(10px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "15px",
            borderBottom: `1px solid ${themes[theme].glassBorder}`,
          }}
        >
          <div
            style={{
              width: "150px",
              height: "20px",
              background: `linear-gradient(90deg, ${themes[theme].glass} 25%, ${themes[theme].glass} 50%, ${themes[theme].glass} 75%)`,
              borderRadius: "4px",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                border: `3px solid ${themes[theme].primary}20`,
                borderTop: `3px solid ${themes[theme].primary}`,
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 15px",
              }}
            />
            <p
              style={{ color: themes[theme].textSecondary, fontSize: "0.9rem" }}
            >
              Loading AMM pool data...
            </p>
            {progress.percent > 0 && (
              <p
                style={{
                  color: themes[theme].textSecondary,
                  fontSize: "0.8rem",
                  marginTop: "5px",
                }}
              >
                {progress.message} ({progress.percent}%)
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          height: "500px",
          width: "100%",
          minHeight: "500px",
          minWidth: "350px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: themes[theme].cardBackground,
          borderRadius: "16px",
          border: `1px solid ${themes[theme].danger}`,
          color: themes[theme].danger,
          fontFamily: fonts[fontFamily],
          fontSize: "0.9rem",
          textAlign: "center",
          padding: "20px",
        }}
      >
        <div>
          <div style={{ fontSize: "2rem", marginBottom: "10px" }}>⚠️</div>
          <div>Failed to load AMM data</div>
          <div style={{ fontSize: "0.8rem", marginTop: "5px", opacity: 0.7 }}>
            {error}
          </div>
          <button
            onClick={() => {
              setLastFetchedPair(null);
              loadChartData();
            }}
            style={{
              marginTop: "15px",
              background: themes[theme].primary,
              color: themes[theme].text,
              border: "none",
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state - Show processed data count
  if (!chartData || chartData.length === 0) {
    return (
      <div
        style={{
          height: "500px",
          width: "100%",
          minHeight: "500px",
          minWidth: "350px",
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
        }}
      >
        <div>
          <div style={{ fontSize: "2rem", marginBottom: "10px" }}>📉</div>
          <div>No AMM trading data available</div>
          <div style={{ fontSize: "0.8rem", marginTop: "5px", opacity: 0.7 }}>
            {baseCurrency}/{quoteCurrency}
          </div>
          <div style={{ fontSize: "0.7rem", marginTop: "10px", opacity: 0.5 }}>
            This pair may not have trading activity yet
          </div>
          {rawTransactions.length > 0 && (
            <div
              style={{ fontSize: "0.7rem", marginTop: "10px", opacity: 0.7 }}
            >
              (Processed {rawTransactions.length} transactions but none valid)
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main chart render
  return (
    <div
      style={{
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: "400px",
        minWidth: "350px",
        maxHeight: "100%",
        position: "relative",
        background: themes[theme].cardBackground,
        borderRadius: "16px",
        border: `1px solid ${themes[theme].glassBorder}`,
        backdropFilter: "blur(10px)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "15px 15px 10px 15px",
          borderBottom: `1px solid ${themes[theme].glassBorder}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 700,
              color: themes[theme].primary,
              fontFamily: fonts[fontFamily],
              marginBottom: "4px",
            }}
          >
            {baseCurrency}/{quoteCurrency}
          </h3>
          <div
            style={{
              display: "flex",
              gap: "15px",
              fontSize: "0.8rem",
              color: themes[theme].textSecondary,
            }}
          >
            <div>
              <span style={{ opacity: 0.7 }}>{priceLabel}: </span>
              <span style={{ color: themes[theme].primary, fontWeight: 600 }}>
                {formatNumber(stats.current, 8)}
              </span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>24h: </span>
              <span
                style={{
                  color:
                    stats.change24h >= 0
                      ? themes[theme].success
                      : themes[theme].danger,
                  fontWeight: 600,
                }}
              >
                {stats.change24h >= 0 ? "+" : ""}
                {formatNumber(stats.change24h, 2)}%
              </span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>High: </span>
              <span style={{ fontWeight: 600 }}>
                {formatNumber(stats.high, 8)}
              </span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>Low: </span>
              <span style={{ fontWeight: 600 }}>
                {formatNumber(stats.low, 8)}
              </span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>Vol: </span>
              <span style={{ fontWeight: 600 }}>
                {formatNumber(stats.volume, 4)} {quoteCurrency}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => setUseLogScale(!useLogScale)}
            style={{
              background: useLogScale
                ? themes[theme].warning
                : themes[theme].glass,
              color: useLogScale
                ? themes[theme].text
                : themes[theme].textSecondary,
              border: `1px solid ${themes[theme].glassBorder}`,
              padding: "6px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
              fontFamily: fonts[fontFamily],
              backdropFilter: "blur(10px)",
              animation:
                yDomain[1] / yDomain[0] > 100 ? "pulse 2s infinite" : "none",
            }}
            title={`Logarithmic scale: ${useLogScale ? "ON" : "OFF"}${
              yDomain[1] / yDomain[0] > 100 ? " (Recommended)" : ""
            }`}
          >
            {useLogScale ? "🔢 Log" : "📏 Linear"}
            {yDomain[1] / yDomain[0] > 100 && " ⚠️"}
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              background: autoRefresh
                ? themes[theme].success
                : themes[theme].glass,
              color: autoRefresh
                ? themes[theme].text
                : themes[theme].textSecondary,
              border: `1px solid ${themes[theme].glassBorder}`,
              padding: "6px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
              fontFamily: fonts[fontFamily],
              backdropFilter: "blur(10px)",
            }}
            title={`Auto-refresh: ${autoRefresh ? "ON" : "OFF"}`}
          >
            🔄 {autoRefresh ? "Auto" : "Manual"}
          </button>
          {["1H", "6H", "24H", "7D", "30D"].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                background:
                  timeRange === range
                    ? themes[theme].primary
                    : themes[theme].glass,
                color:
                  timeRange === range
                    ? themes[theme].text
                    : themes[theme].textSecondary,
                border: `1px solid ${themes[theme].glassBorder}`,
                padding: "6px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: 600,
                fontFamily: fonts[fontFamily],
                backdropFilter: "blur(10px)",
              }}
            >
              {range}
            </button>
          ))}
          {[
            { type: "area", icon: "📊" },
            { type: "line", icon: "📈" },
            { type: "bar", icon: "📉" },
          ].map(({ type, icon }) => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              style={{
                background:
                  chartType === type
                    ? themes[theme].primary
                    : themes[theme].glass,
                color:
                  chartType === type
                    ? themes[theme].text
                    : themes[theme].textSecondary,
                border: `1px solid ${themes[theme].glassBorder}`,
                padding: "6px 10px",
                borderRadius: "8px",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
              title={`${type} chart`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      {progress.percent > 0 && progress.percent < 100 && (
        <div
          style={{
            flex: "0 0 auto",
            padding: "0 15px",
            height: "4px",
            background: themes[theme].glass,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress.percent}%`,
              background: themes[theme].primary,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {/* Chart Area */}
      <div
        ref={chartContainerRef}
        style={{
          flex: "1 1 auto",
          width: "100%",
          minHeight: "300px",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            display: "flex",
          }}
        >
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {chartData.length > 0 && (
              <ChartRenderer
                chartType={chartType}
                chartData={chartData}
                chartColors={chartColors}
                yDomain={yDomain}
                useLogScale={useLogScale}
                formatYAxisTick={formatYAxisTick}
                CustomTooltip={CustomTooltip}
              />
            )}
          </div>
        </div>

        {/* Current price badge */}
        <div
          style={{
            position: "absolute",
            right: "20px",
            top: "20px",
            background: themes[theme].cardBackground,
            border: `1px solid ${themes[theme].border}`,
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: themes[theme].primary,
            fontFamily: fonts[fontFamily],
            boxShadow: `0 4px 15px rgba(${hexToRgb(
              themes[theme].primary
            )}, 0.2)`,
          }}
        >
          {formatNumber(stats.current, 8)} {priceLabel}
        </div>
      </div>
    </div>
  );
};

const ChartRenderer = ({
  chartType,
  chartData,
  chartColors,
  yDomain,
  useLogScale,
  formatYAxisTick,
  CustomTooltip,
}) => {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        if (offsetWidth > 0 && offsetHeight > 0) {
          setDimensions({ width: offsetWidth, height: offsetHeight });
          setIsReady(true);
        }
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (!isReady || dimensions.width <= 0 || dimensions.height <= 0) {
    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.5)",
        }}
      >
        Initializing chart...
      </div>
    );
  }

  const yAxisTickFormatter = (value) => {
    try {
      return formatYAxisTick(value);
    } catch (e) {
      return value.toString();
    }
  };

  const chartKey = `${chartType}-${useLogScale ? "log" : "linear"}`;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={300}
        minHeight={200}
        aspect={undefined}
        debounce={100}
      >
        {chartType === "area" ? (
          <AreaChart
            key={chartKey}
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartColors.gradientStart}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={chartColors.gradientEnd}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
              stroke={chartColors.text}
              fontSize={12}
            />
            {/* Left Y-axis - unchanged */}
            <YAxis
              key={`left-${useLogScale}`}
              yAxisId="left"
              orientation="left"
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={yAxisTickFormatter}
              domain={yDomain}
              width={60}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
            />
            {/* Right Y-axis - copy of left, positioned inside chart */}
            <YAxis
              key={`right-${useLogScale}`}
              yAxisId="right"
              orientation="right"
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={yAxisTickFormatter}
              domain={yDomain}
              width={60}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
              tickLine={false}
              axisLine={false}
              mirror={true}
              tick={true}
              tickMargin={-15}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="quotePerBase"
              stroke={chartColors.line}
              fill="url(#priceGradient)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: chartColors.line }}
            />
          </AreaChart>
        ) : chartType === "line" ? (
          <LineChart
            key={chartKey}
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
              stroke={chartColors.text}
              fontSize={12}
            />
            {/* Left Y-axis - unchanged */}
            <YAxis
              key={`left-${useLogScale}`}
              yAxisId="left"
              orientation="left"
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={yAxisTickFormatter}
              domain={yDomain}
              width={60}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
            />
            {/* Right Y-axis - copy of left, positioned inside chart */}
            <YAxis
              key={`right-${useLogScale}`}
              yAxisId="right"
              orientation="right"
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={yAxisTickFormatter}
              domain={yDomain}
              width={60}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
              tickLine={false}
              axisLine={false}
              mirror={true}
              tick={true}
              tickMargin={-15}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="quotePerBase"
              stroke={chartColors.line}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: chartColors.line }}
            />
          </LineChart>
        ) : (
          <BarChart
            key={chartKey}
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
              stroke={chartColors.text}
              fontSize={12}
            />
            {/* Left Y-axis - unchanged */}
            <YAxis
              key={`left-${useLogScale}`}
              yAxisId="left"
              orientation="left"
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={yAxisTickFormatter}
              domain={yDomain}
              width={60}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
            />
            {/* Right Y-axis - copy of left, positioned inside chart */}
            <YAxis
              key={`right-${useLogScale}`}
              yAxisId="right"
              orientation="right"
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={yAxisTickFormatter}
              domain={yDomain}
              width={60}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
              tickLine={false}
              axisLine={false}
              mirror={true}
              tick={true}
              tickMargin={-15}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="quotePerBase"
              fill={chartColors.line}
              opacity={0.7}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default PairsChart;

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
  loadPairChartData,
  loadTokenChartData,
  processChartData,
  calculateStats,
} from "./tradingChart.data";
import {
  formatCurrencyCode,
  formatYAxisTick,
  formatNumber,
  hexToRgb,
  cleanupOldCache,
} from "./tradingChart.utils";

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

const TradingChart = ({
  selectedPair,
  selectedToken,
  tokenPrices,
  theme,
  themes,
  fonts,
  fontFamily,
  transactions,
  visiblePairsCount,
}) => {
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState("7D");
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
  const [lastFetchedData, setLastFetchedData] = useState(null);
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
    const values = chartData.map((d) => d.quotePerBase || d.tokensPerXrp);
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
        if (
          (selectedPair?.currency1 && selectedPair?.currency2) ||
          (selectedToken?.currency && selectedToken?.issuer)
        ) {
          setLastFetchedData(null);
          loadChartData();
        }
      }, 120000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedPair, selectedToken]);

  const loadChartData = useCallback(async () => {
    const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
    const isTokenChart = selectedToken?.currency && selectedToken?.issuer;
    if (!isPairChart && !isTokenChart) {
      setChartData([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    setProgress({ message: "Loading chart data...", percent: 0 });
    try {
      let result;
      if (isPairChart) {
        result = await loadPairChartData(
          selectedPair,
          tokenPrices,
          setProgress
        );
      } else if (isTokenChart) {
        result = await loadTokenChartData(selectedToken, setProgress);
      }
      if (result.error) {
        throw new Error(result.error);
      }
      const { chartData: rawData } = result;
      setRawTransactions(rawData);
      setLastFetchedData(
        isPairChart
          ? `pair_${selectedPair.currency1}-${selectedPair.issuer1}-${selectedPair.currency2}-${selectedPair.issuer2}`
          : `token_${selectedToken.currency}-${selectedToken.issuer}`
      );
      const processed = processChartData(rawData, timeRange, isPairChart);
      setChartData(processed);
      setStats(calculateStats(processed, isPairChart));
      setProgress({ message: "Complete!", percent: 100 });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setTimeout(() => setProgress({ message: "", percent: 0 }), 500);
    }
  }, [selectedPair, selectedToken, tokenPrices, timeRange]);

  useEffect(() => {
    const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
    const isTokenChart = selectedToken?.currency && selectedToken?.issuer;
    if (isPairChart || isTokenChart) {
      const dataKey = isPairChart
        ? `pair_${selectedPair.currency1}-${selectedPair.issuer1}-${selectedPair.currency2}-${selectedPair.issuer2}`
        : `token_${selectedToken.currency}-${selectedToken.issuer}`;
      if (lastFetchedData === dataKey && rawTransactions.length > 0) {
        const isPair = isPairChart;
        const processed = processChartData(rawTransactions, timeRange, isPair);
        setChartData(processed);
        setStats(calculateStats(processed, isPair));
      } else {
        loadChartData();
      }
    }
  }, [selectedPair, selectedToken, loadChartData, timeRange]);

  useEffect(() => {
    if (rawTransactions.length > 0) {
      const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
      const processed = processChartData(
        rawTransactions,
        timeRange,
        isPairChart
      );
      setChartData(processed);
      setStats(calculateStats(processed, isPairChart));
    }
  }, [timeRange, rawTransactions, selectedPair, selectedToken]);

  useEffect(() => {
    setTimeRange("7D");
  }, [selectedPair, selectedToken]);

  if (
    (!selectedPair || (!selectedPair.currency1 && !selectedPair.currency2)) &&
    (!selectedToken || (!selectedToken.currency && !selectedToken.issuer))
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
          <div style={{ fontSize: "2rem", marginBottom: "10px" }}>📊</div>
          <div>Select a token or pair to view chart</div>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
      const isTokenChart = selectedToken?.currency && selectedToken?.issuer;

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
          {isPairChart ? (
            <>
              <div>
                Price:{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: 600 }}
                >
                  {formatNumber(data.quotePerBase, 8)}{" "}
                  {formatCurrencyCode(selectedPair?.currency2)}
                </span>
              </div>
              <div>
                Volume:{" "}
                <span style={{ color: themes[theme].textSecondary }}>
                  {formatNumber(data.volume, 4)}{" "}
                  {formatCurrencyCode(selectedPair?.currency2)}
                </span>
              </div>
            </>
          ) : isTokenChart ? (
            <>
              <div>
                Price:{" "}
                <span
                  style={{ color: themes[theme].secondary, fontWeight: 600 }}
                >
                  {formatNumber(data.tokensPerXrp, 10)}{" "}
                  {formatCurrencyCode(selectedToken?.currency)}
                </span>
              </div>
              <div>
                Volume:{" "}
                <span style={{ color: themes[theme].textSecondary }}>
                  {formatNumber(data.assetVolume, 4)}{" "}
                  {formatCurrencyCode(selectedToken?.currency)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      );
    }
    return null;
  };

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
              Loading chart data...
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
          <div>Failed to load chart data</div>
          <div style={{ fontSize: "0.8rem", marginTop: "5px", opacity: 0.7 }}>
            {error}
          </div>
          <button
            onClick={() => {
              setLastFetchedData(null);
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

  if (!chartData || chartData.length === 0) {
    const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
    const isTokenChart = selectedToken?.currency && selectedToken?.issuer;
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
          <div>No trading data available</div>
          <div style={{ fontSize: "0.8rem", marginTop: "5px", opacity: 0.7 }}>
            {isPairChart
              ? `${formatCurrencyCode(
                  selectedPair?.currency1
                )}/${formatCurrencyCode(selectedPair?.currency2)}`
              : `XRP/${formatCurrencyCode(selectedToken?.currency)}`}
          </div>
          <div style={{ fontSize: "0.7rem", marginTop: "10px", opacity: 0.5 }}>
            This asset may not have trading activity yet
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

  const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
  const isTokenChart = selectedToken?.currency && selectedToken?.issuer;
  const chartTitle = isPairChart
    ? `${formatCurrencyCode(selectedPair?.currency1)}/${formatCurrencyCode(
        selectedPair?.currency2
      )}`
    : `XRP/${formatCurrencyCode(selectedToken?.currency)}`;
  const priceLabel = isPairChart
    ? `${formatCurrencyCode(selectedPair?.currency2)} per ${formatCurrencyCode(
        selectedPair?.currency1
      )}`
    : `${formatCurrencyCode(selectedToken?.currency)} per XRP`;
  const volumeLabel = isPairChart
    ? `${formatCurrencyCode(selectedPair?.currency2)}`
    : `${formatCurrencyCode(selectedToken?.currency)}`;
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
            {chartTitle}
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
              <span style={{ opacity: 0.7 }}>Price: </span>
              <span style={{ color: themes[theme].primary, fontWeight: 600 }}>
                {isPairChart
                  ? formatNumber(stats.current, 8)
                  : formatNumber(stats.current, 10)}{" "}
                {isPairChart
                  ? formatCurrencyCode(selectedPair?.currency2)
                  : formatCurrencyCode(selectedToken?.currency)}
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
                {isPairChart
                  ? formatNumber(stats.high, 8)
                  : formatNumber(stats.high, 10)}
              </span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>Low: </span>
              <span style={{ fontWeight: 600 }}>
                {isPairChart
                  ? formatNumber(stats.low, 8)
                  : formatNumber(stats.low, 10)}
              </span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>Vol: </span>
              <span style={{ fontWeight: 600 }}>
                {formatNumber(stats.volume, 2)} {volumeLabel}
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
                isPairChart={isPairChart}
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
          {isPairChart
            ? formatNumber(stats.current, 8)
            : formatNumber(stats.current, 10)}{" "}
          {priceLabel}
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
  isPairChart,
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
  const dataKey = isPairChart ? "quotePerBase" : "tokensPerXrp";
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
            data={chartData}
            margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
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
            <YAxis
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={(value) => formatYAxisTick(value)}
              domain={yDomain}
              width={80}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={chartColors.line}
              fill="url(#priceGradient)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: chartColors.line }}
            />
          </AreaChart>
        ) : chartType === "line" ? (
          <LineChart
            data={chartData}
            margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
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
            <YAxis
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={(value) => formatYAxisTick(value)}
              domain={yDomain}
              width={80}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={chartColors.line}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: chartColors.line }}
            />
          </LineChart>
        ) : (
          <BarChart
            data={chartData}
            margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
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
            <YAxis
              stroke={chartColors.text}
              fontSize={12}
              tickFormatter={(value) => formatYAxisTick(value)}
              domain={yDomain}
              width={80}
              scale={useLogScale ? "log" : "linear"}
              allowDataOverflow={useLogScale}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={dataKey} fill={chartColors.line} opacity={0.7} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default TradingChart;

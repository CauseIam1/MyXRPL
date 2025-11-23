import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
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
  formatPrice,
  hexToRgb,
  cleanupOldCache,
  sampleData,
  debounce,
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
  const loadChartDataRef = useRef();
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
    const validValues = values.filter((v) => v > 0 && isFinite(v));
    if (validValues.length === 0) {
      return useLogScale ? [0.0000000001, 1] : [0, 1];
    }
    const sortedValues = [...validValues].sort((a, b) => a - b);
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
    loadChartDataRef.current = loadChartData;
  }, [loadChartData]);

  useEffect(() => {
    cleanupOldCache();
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
        const isTokenChart = selectedToken?.currency && selectedToken?.issuer;
        if (isPairChart || isTokenChart) {
          loadChartDataRef.current();
        }
      }, 120000); // 2 minutes
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedPair, selectedToken]);

  useEffect(() => {
    const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
    const isTokenChart = selectedToken?.currency && selectedToken?.issuer;
    if (isPairChart || isTokenChart) {
      loadChartDataRef.current();
    } else {
      setChartData([]);
      setRawTransactions([]);
    }
  }, [
    selectedPair?.currency1,
    selectedPair?.currency2,
    selectedToken?.currency,
    selectedToken?.issuer,
  ]);

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
  }, [timeRange, rawTransactions, selectedPair]);

  useEffect(() => {
    setTimeRange("7D");
  }, [
    selectedPair?.currency1,
    selectedPair?.currency2,
    selectedToken?.currency,
    selectedToken?.issuer,
  ]);

  const isValidSelection = useMemo(() => {
    const isPairValid = selectedPair?.currency1 && selectedPair?.currency2;
    const isTokenValid = selectedToken?.currency && selectedToken?.issuer;
    return isPairValid || isTokenValid;
  }, [selectedPair, selectedToken]);

  const sampledChartData = useMemo(() => {
    return sampleData(chartData, 1000); // Limit to 1000 data points
  }, [chartData]);

  const chartTitle = useMemo(() => {
    if (selectedPair?.currency1 && selectedPair?.currency2) {
      return `${formatCurrencyCode(
        selectedPair.currency1
      )}/${formatCurrencyCode(selectedPair.currency2)}`;
    }
    if (selectedToken?.currency && selectedToken?.issuer) {
      return `XRP/${formatCurrencyCode(selectedToken.currency)}`;
    }
    return "";
  }, [selectedPair, selectedToken]);

  const priceLabel = useMemo(() => {
    if (selectedPair?.currency1 && selectedPair?.currency2) {
      return `${formatCurrencyCode(
        selectedPair.currency2
      )} per ${formatCurrencyCode(selectedPair.currency1)}`;
    }
    if (selectedToken?.currency && selectedToken?.issuer) {
      return `${formatCurrencyCode(selectedToken.currency)} per XRP`;
    }
    return "";
  }, [selectedPair, selectedToken]);

  const volumeLabel = useMemo(() => {
    if (selectedPair?.currency1 && selectedPair?.currency2) {
      return formatCurrencyCode(selectedPair.currency2);
    }
    if (selectedToken?.currency && selectedToken?.issuer) {
      return formatCurrencyCode(selectedToken.currency);
    }
    return "";
  }, [selectedPair, selectedToken]);

  const CustomTooltip = memo(({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isPairChart = selectedPair?.currency1 && selectedPair?.currency2;
      const isTokenChart = selectedToken?.currency && selectedToken?.issuer;
      return (
        <div
          style={{
            background: themes[theme].cardBackground,
            border: `1px solid ${themes[theme].border}`,
            borderRadius: "12px",
            padding: "15px",
            color: themes[theme].text,
            fontFamily: fonts[fontFamily],
            fontSize: "0.85rem",
            boxShadow: `0 8px 25px rgba(${hexToRgb(
              themes[theme].primary
            )}, 0.3)`,
            minWidth: "220px",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              color: themes[theme].primary,
              fontWeight: 600,
              marginBottom: "6px",
              fontSize: "0.9rem",
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
                  {formatPrice(data.quotePerBase)}{" "}
                  {formatCurrencyCode(selectedPair?.currency2)}
                </span>
              </div>
              <div>
                Volume:{" "}
                <span style={{ color: themes[theme].textSecondary }}>
                  {formatPrice(data.volume)}{" "}
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
                  {formatPrice(data.tokensPerXrp)}{" "}
                  {formatCurrencyCode(selectedToken?.currency)}
                </span>
              </div>
              <div>
                Volume:{" "}
                <span style={{ color: themes[theme].textSecondary }}>
                  {formatPrice(data.assetVolume)}{" "}
                  {formatCurrencyCode(selectedToken?.currency)}
                </span>
              </div>
              {/* Swap Direction Indicator - Enhanced Styling */}
              {data.swapDirection !== undefined && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "8px 0 4px 0",
                    padding: "6px 0",
                    borderRadius: "8px",
                    background: `rgba(${hexToRgb(themes[theme].glass)}, 0.5)`,
                  }}
                >
                  {data.swapDirection === "buy" ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          color: themes[theme].success,
                          fontSize: "1.3rem",
                          fontWeight: "bold",
                          textShadow: `0 0 8px rgba(${hexToRgb(
                            themes[theme].success
                          )}, 0.5)`,
                        }}
                      >
                        ↘
                      </span>
                      <span
                        style={{
                          color: themes[theme].textSecondary,
                          fontSize: "0.8rem",
                          fontWeight: 500,
                        }}
                      >
                        Buying {formatCurrencyCode(selectedToken?.currency)}
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          color: themes[theme].primary,
                          fontSize: "1.3rem",
                          fontWeight: "bold",
                          textShadow: `0 0 8px rgba(${hexToRgb(
                            themes[theme].primary
                          )}, 0.5)`,
                        }}
                      >
                        ↗
                      </span>
                      <span
                        style={{
                          color: themes[theme].textSecondary,
                          fontSize: "0.8rem",
                          fontWeight: 500,
                        }}
                      >
                        Selling {formatCurrencyCode(selectedToken?.currency)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div>
                XRP Volume:{" "}
                <span style={{ color: themes[theme].textSecondary }}>
                  {formatPrice(data.xrpVolume)} XRP
                </span>
              </div>
            </>
          ) : null}
        </div>
      );
    }
    return null;
  });

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

  if (!isValidSelection) {
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
              loadChartDataRef.current();
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
          <div>
            No trading data available. The Dex has not been enabled yet.
          </div>
          <div style={{ fontSize: "0.8rem", marginTop: "5px", opacity: 0.7 }}>
            {selectedPair?.currency1 && selectedPair?.currency2
              ? `${formatCurrencyCode(
                  selectedPair?.currency1
                )}/${formatCurrencyCode(selectedPair?.currency2)}`
              : `XRP/${formatCurrencyCode(selectedToken?.currency)}`}
          </div>
        </div>
      </div>
    );
  }

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
              flexWrap: "wrap",
            }}
          >
            <div>
              <span style={{ opacity: 0.7 }}>Price: </span>
              <span style={{ color: themes[theme].primary, fontWeight: 600 }}>
                {formatPrice(stats.current)} {volumeLabel}
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
                {formatPrice(stats.change24h)}%
              </span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>High: </span>
              <span style={{ fontWeight: 600 }}>{formatPrice(stats.high)}</span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>Low: </span>
              <span style={{ fontWeight: 600 }}>{formatPrice(stats.low)}</span>
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>Vol: </span>
              <span style={{ fontWeight: 600 }}>
                {formatPrice(stats.volume)} {volumeLabel}
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
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
          {["1H", "6H", "24H", "3D", "7D", "ALL"].map((range) => (
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
          <div
            style={{
              width: "100%",
              height: "100%",
              position: "relative",
              minHeight: "300px",
            }}
          >
            {sampledChartData.length > 0 && (
              <ChartRenderer
                chartType={chartType}
                chartData={sampledChartData}
                chartColors={chartColors}
                yDomain={yDomain}
                useLogScale={useLogScale}
                formatYAxisTick={formatYAxisTick}
                CustomTooltip={CustomTooltip}
                isPairChart={selectedPair?.currency1 && selectedPair?.currency2}
                timeRange={timeRange}
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
          {formatPrice(stats.current)} {priceLabel}
        </div>
      </div>
    </div>
  );
};

const ChartRenderer = memo(
  ({
    chartType,
    chartData,
    chartColors,
    yDomain,
    useLogScale,
    formatYAxisTick,
    CustomTooltip,
    isPairChart,
    timeRange,
  }) => {
    const containerRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isReady, setIsReady] = useState(false);
    const formatXAxisTick = useMemo(() => {
      return (value) => {
        const date = new Date(value);
        if (isNaN(date.getTime())) return "";

        switch (timeRange) {
          case "1H":
            return date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
          case "6H":
            return date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
          case "24H":
            return date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
          case "3D":
          case "7D":
            return date.toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });
          case "ALL":
            const timeSpan =
              chartData.length > 1
                ? (chartData[chartData.length - 1].time - chartData[0].time) /
                  (24 * 3600 * 1000)
                : 0;

            if (timeSpan > 365) {
              return date.toLocaleDateString([], {
                year: "numeric",
                month: "short",
              });
            } else if (timeSpan > 30) {
              return date.toLocaleDateString([], {
                month: "short",
                day: "numeric",
              });
            } else if (timeSpan > 1) {
              return date.toLocaleDateString([], {
                month: "short",
                day: "numeric",
              });
            } else {
              return date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
            }
          default:
            return date.toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });
        }
      };
    }, [timeRange, chartData]);

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

      const resizeObserver = new ResizeObserver(
        debounce(updateDimensions, 100)
      );

      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }, []);

    useEffect(() => {
      const timer = setTimeout(() => {
        if (!isReady && containerRef.current) {
          const { offsetWidth, offsetHeight } = containerRef.current;
          if (offsetWidth > 0 && offsetHeight > 0) {
            setDimensions({ width: offsetWidth, height: offsetHeight });
            setIsReady(true);
          }
        }
      }, 500);

      return () => clearTimeout(timer);
    }, [isReady]);

    const chartStyle = useMemo(() => {
      const showDots = dimensions.width > 500;
      const strokeWidth = dimensions.width > 768 ? 2 : 1;
      return { showDots, strokeWidth };
    }, [dimensions]);

    const tickCount = useMemo(() => {
      if (dimensions.width < 400) return 3;
      if (dimensions.width < 600) return 4;
      if (dimensions.width < 800) return 6;
      return 8;
    }, [dimensions.width]);

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
                tickFormatter={formatXAxisTick}
                stroke={chartColors.text}
                fontSize={12}
                scale="time"
                tickCount={tickCount}
                interval="preserveStartEnd"
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
                strokeWidth={chartStyle.strokeWidth}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 2, fill: chartColors.line }}
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
                tickFormatter={formatXAxisTick}
                stroke={chartColors.text}
                fontSize={12}
                scale="time"
                tickCount={tickCount}
                interval="preserveStartEnd"
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
                strokeWidth={chartStyle.strokeWidth}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 2, fill: chartColors.line }}
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
                tickFormatter={formatXAxisTick}
                stroke={chartColors.text}
                fontSize={12}
                scale="time"
                tickCount={tickCount}
                interval="preserveStartEnd"
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
  }
);

export default TradingChart;

import React, { useState, useEffect, useRef } from "react";

const TokenChart = ({
  selectedToken,
  tokenPrices,
  theme,
  themes,
  fonts,
  fontFamily,
  isChartReady,
  transactions,
  visiblePairsCount,
}) => {
  const chartContainerRef = useRef(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [fullChartData, setFullChartData] = useState([]);
  const [displayData, setDisplayData] = useState([]);
  const [chartType, setChartType] = useState("line");
  const [highLowPrices, setHighLowPrices] = useState({ high: 0, low: 0 });
  const [currentPrice, setCurrentPrice] = useState(null);
  const [hasValidToken, setHasValidToken] = useState(false);
  const [progress, setProgress] = useState({ message: "", percent: 0 });
  const CHART_CACHE_KEY = "chart_data_cache_";
  const asciiToHex = (ascii) => {
    if (!ascii || ascii === "XRP") return ascii;
    if (ascii.length <= 3) return ascii;
    try {
      let hex = "";
      for (let i = 0; i < ascii.length; i++) {
        hex += ascii.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0");
      }
      hex = hex.padEnd(40, "0");
      return hex;
    } catch (e) {
      return ascii;
    }
  };

  const formatCurrencyCode = (code) => {
    if (code === "XRP") return "XRP";
    if (code && typeof code === "string" && code.length === 40) {
      try {
        let ascii = "";
        for (let i = 0; i < code.length; i += 2) {
          const hexPair = code.substr(i, 2);
          const charCode = parseInt(hexPair, 16);
          if (charCode !== 0 && charCode >= 32 && charCode <= 126) {
            ascii += String.fromCharCode(charCode);
          }
        }
        if (ascii.length > 0 && ascii.length <= 20) {
          return ascii;
        }
      } catch (e) {}
    }
    if (code && code.length > 12) return code.substring(0, 12) + "...";
    return code || "Unknown";
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return "0.00";
    return parseFloat(num).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatLargeNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return "0.00";
    const absNum = Math.abs(num);
    if (absNum >= 1000000000) {
      return (
        (num / 1000000000).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "B"
      );
    } else if (absNum >= 1000000) {
      return (
        (num / 1000000).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "M"
      );
    } else if (absNum >= 1000) {
      return (
        (num / 1000).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "K"
      );
    } else {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  };

  const cacheChartData = (tokenKey, data) => {
    try {
      const cacheData = {
        data: data,
        timestamp: Date.now(),
        expires: Date.now() + 24 * 60 * 60 * 1000,
        tokenKey: tokenKey,
      };
      localStorage.setItem(
        `${CHART_CACHE_KEY}${tokenKey}`,
        JSON.stringify(cacheData)
      );
    } catch (e) {
      console.warn("Could not cache chart data:", e);
    }
  };

  const getCachedChartData = (tokenKey) => {
    try {
      const cached = localStorage.getItem(`${CHART_CACHE_KEY}${tokenKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.tokenKey === tokenKey && parsed.expires > Date.now()) {
          return parsed.data;
        } else {
          localStorage.removeItem(`${CHART_CACHE_KEY}${tokenKey}`);
        }
      }
    } catch (e) {
      console.warn("Could not retrieve cached chart data:", e);
      localStorage.removeItem(`${CHART_CACHE_KEY}${tokenKey}`);
    }
    return null;
  };

  const renderSvgChart = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          No data available
        </div>
      );
    }
    const validData = data.filter(
      (point) =>
        point &&
        typeof point.time === "number" &&
        typeof point.value === "number" &&
        isFinite(point.value) &&
        point.value > 0 &&
        isFinite(point.time)
    );
    if (validData.length === 0) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          No valid price data
        </div>
      );
    }
    const width = 600;
    const height = 300;
    const padding = { top: 30, right: 100, bottom: 40, left: 100 };
    const chartHeight = height - padding.top - padding.bottom;
    const chartWidth = width - padding.left - padding.right;
    const allValues = validData
      .map((d) => d.value)
      .filter((v) => v > 0 && isFinite(v));
    if (allValues.length === 0) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          No valid price data
        </div>
      );
    }

    const actualMin = Math.min(...allValues);
    const actualMax = Math.max(...allValues);
    const range = actualMax - actualMin;
    const buffer = range * 0.4;
    const chartMin = Math.max(0, actualMin - buffer);
    const chartMax = actualMax + buffer;
    const displayRange = chartMax - chartMin || 1;
    const firstPoint = validData[0];
    const lastPoint = validData[validData.length - 1];
    const fullTimeRange = lastPoint.time - firstPoint.time || 1;
    const points = validData
      .map((d, i) => {
        const xRatio = (d.time - firstPoint.time) / fullTimeRange;
        const x = padding.left + xRatio * chartWidth;
        const y =
          height -
          padding.bottom -
          ((d.value - chartMin) / displayRange) * chartHeight;
        if (!isFinite(x) || !isFinite(y)) return "";
        return `${x},${y}`;
      })
      .filter((point) => point !== "")
      .join(" ");

    const areaPoints = `M${padding.left},${
      height - padding.bottom
    } ${points} L${padding.left + chartWidth},${height - padding.bottom} Z`;

    const bars = [];
    if (chartType === "bar") {
      validData.forEach((d, i) => {
        const xRatio = (d.time - firstPoint.time) / fullTimeRange;
        const x = padding.left + xRatio * chartWidth;
        const y =
          height -
          padding.bottom -
          ((d.value - chartMin) / displayRange) * chartHeight;
        const barHeight = ((d.value - chartMin) / displayRange) * chartHeight;
        if (isFinite(x) && isFinite(y) && isFinite(barHeight)) {
          bars.push({
            x: x - 2,
            y: height - padding.bottom - barHeight,
            width: 4,
            height: barHeight,
          });
        }
      });
    }

    const candlesticks = [];
    if (chartType === "candlestick" && validData.length >= 4) {
      for (let i = 0; i < validData.length - 3; i += 4) {
        const group = validData.slice(i, i + 4);
        if (group.length >= 4) {
          const open = group[0].value;
          const high = Math.max(...group.map((d) => d.value));
          const low = Math.min(...group.map((d) => d.value));
          const close = group[3].value;
          const time = group[1].time;
          const xRatio = (time - firstPoint.time) / fullTimeRange;
          const x = padding.left + xRatio * chartWidth;
          const openY =
            height -
            padding.bottom -
            ((open - chartMin) / displayRange) * chartHeight;
          const closeY =
            height -
            padding.bottom -
            ((close - chartMin) / displayRange) * chartHeight;
          const highY =
            height -
            padding.bottom -
            ((high - chartMin) / displayRange) * chartHeight;
          const lowY =
            height -
            padding.bottom -
            ((low - chartMin) / displayRange) * chartHeight;
          if (
            isFinite(x) &&
            isFinite(openY) &&
            isFinite(closeY) &&
            isFinite(highY) &&
            isFinite(lowY)
          ) {
            candlesticks.push({
              x: x,
              openY,
              closeY,
              highY,
              lowY,
              isUp: close > open,
            });
          }
        }
      }
    }

    const maxVolume = Math.max(...validData.map((d) => d.volume || 0));
    const volumeBars = validData
      .map((d, i) => {
        const xRatio = (d.time - firstPoint.time) / fullTimeRange;
        const x = padding.left + xRatio * chartWidth;
        const barHeight =
          maxVolume > 0 ? ((d.volume || 0) / maxVolume) * 40 : 0;
        const y = height - 20 - barHeight;
        if (!isFinite(x) || !isFinite(y) || !isFinite(barHeight)) {
          return null;
        }
        return { x, y, height: barHeight, volume: d.volume || 0 };
      })
      .filter((bar) => bar !== null);

    const gridLines = [];
    const valueLabels = [];
    const labelCount = 5;
    for (let i = 0; i <= labelCount; i++) {
      const y = padding.top + (i * chartHeight) / labelCount;
      const value = chartMax - i * (displayRange / labelCount);
      const displayValue = value > 0 ? value : 0;
      if (isFinite(y) && isFinite(displayValue)) {
        gridLines.push(
          <line
            key={`grid-${i}`}
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke="rgba(197, 203, 206, 0.1)"
            strokeWidth="1"
          />
        );
        valueLabels.push(
          <text
            key={`label-${i}`}
            x={width - padding.right + 10}
            y={y + 4}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="start"
          >
            {formatNumber(displayValue)}
          </text>
        );
      }
    }

    const timeLabels = [];
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
    for (let i = 0; i < 8; i++) {
      const datePoint = new Date(startDate);
      datePoint.setDate(startDate.getDate() + i);
      const timeRatio = i / 7;
      const x = padding.left + timeRatio * chartWidth;
      if (isFinite(x)) {
        const dateLabel = datePoint.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
        timeLabels.push(
          <text
            key={`time-${i}`}
            x={x}
            y={height - 5}
            fill="#94a3b8"
            fontSize="10"
            textAnchor="middle"
          >
            {dateLabel}
          </text>
        );
      }
    }

    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 10,
            display: "flex",
            gap: "5px",
          }}
        >
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            style={{
              background: "rgba(39, 162, 219, 0.2)",
              color: "#e2e8f0",
              border: "1px solid #27a2db",
              borderRadius: "4px",
              padding: "2px 5px",
              fontSize: "10px",
            }}
          >
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
            <option value="candlestick">Candlestick</option>
          </select>
        </div>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ background: "#0f1c2e", fontFamily: "Arial, sans-serif" }}
        >
          {gridLines}
          {valueLabels}
          {timeLabels}
          {chartType === "line" && points && (
            <polyline
              fill="none"
              stroke="#27a2db"
              strokeWidth="2"
              points={points}
            />
          )}
          {chartType === "area" && points && (
            <>
              <path
                d={areaPoints}
                fill="rgba(39, 162, 219, 0.2)"
                stroke="none"
              />
              <polyline
                fill="none"
                stroke="#27a2db"
                strokeWidth="2"
                points={points}
              />
            </>
          )}
          {chartType === "bar" &&
            bars.map((bar, i) => (
              <rect
                key={`bar-${i}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill="#27a2db"
              />
            ))}
          {chartType === "candlestick" &&
            candlesticks.map((candle, i) => (
              <g key={`candle-${i}`}>
                <line
                  x1={candle.x}
                  y1={candle.highY}
                  x2={candle.x}
                  y2={candle.lowY}
                  stroke="#94a3b8"
                  strokeWidth="1"
                />
                <rect
                  x={candle.x - 3}
                  y={Math.min(candle.openY, candle.closeY)}
                  width="6"
                  height={Math.abs(candle.openY - candle.closeY) || 1}
                  fill={candle.isUp ? "#4ade80" : "#f87171"}
                />
              </g>
            ))}
          {volumeBars.map(
            (bar, i) =>
              bar && (
                <rect
                  key={`vol-${i}`}
                  x={bar.x - 2}
                  y={bar.y}
                  width="4"
                  height={bar.height}
                  fill="rgba(39, 162, 219, 0.3)"
                />
              )
          )}
          <text
            x={10}
            y={20}
            fill="#27a2db"
            fontSize="12"
            textAnchor="start"
            fontWeight="bold"
          >
            {formatNumber(currentPrice)} per XRP
          </text>
          <text x={10} y={35} fill="#4ade80" fontSize="10" textAnchor="start">
            H: {formatNumber(highLowPrices.high)}
          </text>
          <text x={10} y={48} fill="#f87171" fontSize="10" textAnchor="start">
            L: {formatNumber(highLowPrices.low)}
          </text>
          <text x={10} y={61} fill="#94a3b8" fontSize="10" textAnchor="start">
            Vol:{" "}
            {formatLargeNumber(
              validData.reduce((sum, d) => sum + (d.volume || 0), 0)
            )}
          </text>
        </svg>
      </div>
    );
  };

  const renderProgressBar = () => {
    if (!isLoading || progress.percent === 0) return null;
    return (
      <div
        style={{
          background: "rgba(39, 162, 219, 0.2)",
          color: "#e2e8f0",
          padding: "10px",
          borderRadius: "5px",
          margin: "10px 0",
          textAlign: "center",
          border: "1px solid rgba(39, 162, 219, 0.3)",
          fontSize: "0.8rem",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "6px",
            background: "rgba(39, 162, 219, 0.2)",
            borderRadius: "3px",
            margin: "0 auto 8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress.percent}%`,
              height: "100%",
              background: "linear-gradient(90deg, #27a2db, #60a5fa)",
              borderRadius: "3px",
              transition: "width 0.3s ease",
            }}
          ></div>
        </div>
        <p style={{ margin: "0 0 5px 0" }}>🔄 {progress.message}</p>
        <p style={{ fontSize: "0.7rem", marginTop: "2px" }}>
          {progress.percent}% complete
        </p>
      </div>
    );
  };

  const getAmmPoolAddress = async (currency, issuer) => {
    const hexCurrency = asciiToHex(currency);
    const endpoints = [
      "wss://xrplcluster.com",
      "wss://s1.ripple.com:443",
      "wss://s2.ripple.com:51233",
    ];
    setProgress({
      message: `Searching for AMM pool for ${formatCurrencyCode(currency)}...`,
      percent: 10,
    });
    for (const endpoint of endpoints) {
      try {
        const poolAddress = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout"));
          }, 5000);
          const ws = new WebSocket(endpoint);
          ws.onopen = () => {
            const request = {
              id: Date.now(),
              command: "amm_info",
              asset: {
                currency: "XRP",
              },
              asset2: {
                currency: hexCurrency,
                issuer: issuer,
              },
            };
            ws.send(JSON.stringify(request));
          };
          ws.onmessage = (event) => {
            clearTimeout(timeout);
            const data = JSON.parse(event.data);
            ws.close();
            if (data.result && data.result.amm && data.result.amm.account) {
              resolve(data.result.amm.account);
            } else {
              resolve(null);
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
        if (poolAddress) return poolAddress;
      } catch (error) {
        console.log(
          `Failed to get pool address from ${endpoint}:`,
          error.message
        );
      }
    }
    return null;
  };

  const fetchTransactions = async (
    account,
    isAmmPool = false,
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
        if (transactions && transactions.length > 0) {
          return transactions;
        }
      } catch (error) {
        console.log(`Endpoint ${endpoint} failed:`, error.message);
      }
    }
    return [];
  };

  const fetchMultiplePages = async (
    endpoint,
    account,
    isAmmPool,
    targetCurrency,
    targetIssuer
  ) => {
    let allTransactions = [];
    let marker = null;
    let pagesFetched = 0;
    const maxPages = 5;
    const hexCurrency = asciiToHex(targetCurrency);
    do {
      try {
        const pageTransactions = await new Promise((resolve, reject) => {
          let timeoutId;
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
          const ws = new WebSocket(endpoint);
          ws.onopen = () => {
            try {
              const request = {
                id: Date.now() + pagesFetched,
                command: "account_tx",
                account: account,
                ledger_index_min: -1,
                ledger_index_max: -1,
                limit: 100,
                forward: false,
                ...(marker ? { marker } : {}),
              };
              ws.send(JSON.stringify(request));
            } catch (sendError) {
              console.error("Error sending request:", sendError);
              cleanup();
              resolve([]);
            }
          };
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.result && data.result.transactions) {
                let transactions = data.result.transactions;
                if (isAmmPool && hexCurrency && targetIssuer) {
                  transactions = transactions.filter((tx) => {
                    try {
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
                    } catch (filterError) {
                      return false;
                    }
                  });
                }
                cleanup();
                resolve({
                  transactions: transactions,
                  marker: data.result.marker,
                });
              } else {
                cleanup();
                resolve({ transactions: [], marker: null });
              }
            } catch (parseError) {
              cleanup();
              resolve({ transactions: [], marker: null });
            }
          };
          ws.onerror = (error) => {
            cleanup();
            resolve({ transactions: [], marker: null });
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
          const progressPercent = Math.min(20 + pagesFetched * 15, 80);
          const accountType = isAmmPool ? "AMM pool" : "issuer";
          setProgress({
            message: `Fetching transactions... Page ${pagesFetched} of ${maxPages}`,
            percent: progressPercent,
          });
          if (!marker) {
            break;
          }
          if (pagesFetched < maxPages && marker) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        } else {
          break;
        }
      } catch (error) {
        break;
      }
    } while (marker && pagesFetched < maxPages);
    return allTransactions;
  };

  const extractTransactionData = (tx, targetCurrency, targetIssuer) => {
    try {
      const meta = tx.meta || tx.metaData;
      if (!meta || !tx.tx) return null;
      const hexCurrency =
        targetCurrency.length <= 3
          ? targetCurrency
          : asciiToHex(targetCurrency);
      if (tx.tx.TransactionType === "Payment") {
        const sent = tx.tx.SendMax || tx.tx.Amount;
        const delivered = meta.DeliveredAmount || tx.tx.Amount;
        let xrpAmount = 0;
        let tokenAmount = 0;
        let hasTargetToken = false;
        if (sent && typeof sent === "string") {
          xrpAmount = parseFloat(sent) / 1000000;
        } else if (sent && typeof sent === "object") {
          if (sent.currency === "XRP") {
            xrpAmount = parseFloat(sent.value);
          } else {
            if (targetCurrency.length <= 3) {
              if (
                sent.currency === targetCurrency &&
                sent.issuer === targetIssuer
              ) {
                tokenAmount = parseFloat(sent.value);
                hasTargetToken = true;
              }
            } else {
              if (
                sent.currency === hexCurrency &&
                sent.issuer === targetIssuer
              ) {
                tokenAmount = parseFloat(sent.value);
                hasTargetToken = true;
              }
            }
          }
        }
        if (delivered && typeof delivered === "string") {
          xrpAmount = parseFloat(delivered) / 1000000;
        } else if (delivered && typeof delivered === "object") {
          if (delivered.currency === "XRP") {
            xrpAmount = parseFloat(delivered.value);
          } else {
            if (targetCurrency.length <= 3) {
              if (
                delivered.currency === targetCurrency &&
                delivered.issuer === targetIssuer
              ) {
                tokenAmount = parseFloat(delivered.value);
                hasTargetToken = true;
              }
            } else {
              if (
                delivered.currency === hexCurrency &&
                delivered.issuer === targetIssuer
              ) {
                tokenAmount = parseFloat(delivered.value);
                hasTargetToken = true;
              }
            }
          }
        }
        if (!hasTargetToken) {
          if (
            sent &&
            sent.currency === "XRP" &&
            delivered &&
            typeof delivered === "object"
          ) {
            if (targetCurrency.length <= 3) {
              if (
                delivered.currency === targetCurrency &&
                delivered.issuer === targetIssuer
              ) {
                xrpAmount = parseFloat(
                  sent.value || parseFloat(sent) / 1000000
                );
                tokenAmount = parseFloat(delivered.value);
                hasTargetToken = true;
              }
            } else {
              if (
                delivered.currency === hexCurrency &&
                delivered.issuer === targetIssuer
              ) {
                xrpAmount = parseFloat(
                  sent.value || parseFloat(sent) / 1000000
                );
                tokenAmount = parseFloat(delivered.value);
                hasTargetToken = true;
              }
            }
          }
        }
        if (!hasTargetToken) {
          return null;
        }
        if (xrpAmount <= 0 || tokenAmount <= 0) {
          return null;
        }
        const MIN_XRP_AMOUNT = 0.01;
        if (xrpAmount < MIN_XRP_AMOUNT) {
          return null;
        }
        if (tokenAmount > 0 && xrpAmount > 0) {
          const tokensPerXrp = tokenAmount / xrpAmount;
          const volume = xrpAmount;
          const timestamp = tx.tx.date + 946684800;
          if (
            tokensPerXrp > 0 &&
            tokensPerXrp < 1000000000 &&
            isFinite(tokensPerXrp)
          ) {
            return {
              tokensPerXrp,
              volume,
              timestamp,
            };
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const processChartData = (mergedData) => {
    setProgress({ message: "Processing chart data...", percent: 85 });
    if (!mergedData || mergedData.length === 0) {
      return [];
    }
    const timeframeSeconds = 7 * 24 * 3600;
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - timeframeSeconds;
    let recentTransactions = mergedData.filter(
      (tx) => tx.timestamp && tx.timestamp >= startTime && tx.timestamp <= now
    );
    if (recentTransactions.length === 0) {
      return [];
    }
    recentTransactions.sort((a, b) => a.timestamp - b.timestamp);
    const values = recentTransactions
      .map((tx) => tx.tokensPerXrp)
      .filter((v) => v > 0 && isFinite(v));
    if (values.length === 0) return [];
    const sortedValues = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sortedValues.length * 0.25);
    const q3Index = Math.floor(sortedValues.length * 0.75);
    const q1 = sortedValues[q1Index];
    const q3 = sortedValues[q3Index];
    const iqr = q3 - q1;
    const lowerBound = Math.max(0, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;
    recentTransactions = recentTransactions.filter((tx) => {
      if (!tx.tokensPerXrp || !isFinite(tx.tokensPerXrp)) return false;
      return tx.tokensPerXrp >= lowerBound && tx.tokensPerXrp <= upperBound;
    });
    const data = [];
    const interval = 3600;
    const hourlyBuckets = {};
    for (let time = startTime; time <= now; time += interval) {
      const hourBucket = Math.floor(time / 3600) * 3600;
      hourlyBuckets[hourBucket] = {
        transactions: [],
        totalTokens: 0,
        totalVolume: 0,
      };
    }
    recentTransactions.forEach((tx) => {
      if (tx.timestamp && tx.tokensPerXrp > 0 && isFinite(tx.tokensPerXrp)) {
        const hourBucket = Math.floor(tx.timestamp / 3600) * 3600;
        if (hourlyBuckets[hourBucket]) {
          hourlyBuckets[hourBucket].transactions.push(tx);
          hourlyBuckets[hourBucket].totalTokens += tx.tokensPerXrp * tx.volume;
          hourlyBuckets[hourBucket].totalVolume += tx.volume;
        }
      }
    });
    Object.keys(hourlyBuckets).forEach((hourKey) => {
      const bucket = hourlyBuckets[hourKey];
      if (bucket.totalVolume > 0) {
        const avgTokensPerXrp = bucket.totalTokens / bucket.totalVolume;
        const totalVol = bucket.totalVolume;
        if (avgTokensPerXrp > 0 && isFinite(avgTokensPerXrp)) {
          data.push({
            time: parseInt(hourKey) + 1800,
            value: avgTokensPerXrp,
            volume: Math.round(totalVol * 1000000) / 1000000,
          });
        }
      }
    });
    data.sort((a, b) => a.time - b.time);
    setProgress({ message: "Finalizing chart...", percent: 95 });
    return data;
  };

  const loadChartData = async (token) => {
    if (
      !token ||
      !token.currency ||
      !token.issuer ||
      token.currency === "Token"
    ) {
      setFullChartData([]);
      setDisplayData([]);
      return;
    }
    const tokenKey = `${token.currency}-${token.issuer}`;
    setProgress({ message: "Checking cache...", percent: 5 });
    const cachedData = getCachedChartData(tokenKey);
    if (cachedData) {
      setFullChartData(cachedData);
      setDisplayData(cachedData);
      setIsLoading(false);
      setProgress({ message: "", percent: 0 });
      return;
    }
    setProgress({ message: "Initializing chart data...", percent: 10 });
    const hexCurrency = asciiToHex(token.currency);
    setChartData([]);
    setIsLoading(true);
    setError(null);
    try {
      setProgress({ message: "Searching for AMM pool...", percent: 15 });
      const poolAddress = await getAmmPoolAddress(token.currency, token.issuer);
      let ammTransactions = [];
      let issuerTransactions = [];
      if (poolAddress) {
        setProgress({ message: "Fetching AMM transactions...", percent: 20 });
        ammTransactions = await fetchTransactions(
          poolAddress,
          true,
          token.currency,
          token.issuer
        );
      }
      setProgress({
        message: "Fetching Dex transactions...",
        percent: 50,
      });
      issuerTransactions = await fetchTransactions(
        token.issuer,
        false,
        token.currency,
        token.issuer
      );
      setProgress({ message: "Processing transaction data...", percent: 70 });
      const ammData = ammTransactions
        .map((tx) => extractTransactionData(tx, token.currency, token.issuer))
        .filter((data) => data !== null);
      const issuerData = issuerTransactions
        .map((tx) => extractTransactionData(tx, token.currency, token.issuer))
        .filter((data) => data !== null);
      const combinedData = [...ammData, ...issuerData];
      combinedData.sort((a, b) => a.timestamp - b.timestamp);
      const data = processChartData(combinedData);
      if (data.length > 0) {
        cacheChartData(tokenKey, data);
      }
      setFullChartData(data);
      setDisplayData(data);
      setChartData(data);
      setIsLoading(false);
      setProgress({ message: "", percent: 0 });
    } catch (err) {
      console.error("Chart loading error:", err);
      setError(`Chart error: ${err.message}`);
      setIsLoading(false);
      setChartData([]);
      setFullChartData([]);
      setDisplayData([]);
      setProgress({ message: "", percent: 0 });
    }
  };

  useEffect(() => {
    if (!Array.isArray(fullChartData) || fullChartData.length === 0) {
      setDisplayData([]);
      return;
    }
    setDisplayData(fullChartData);
    const values = fullChartData
      .map((d) => (typeof d.value === "number" ? d.value : 0))
      .filter((v) => v > 0 && isFinite(v));
    if (values.length > 0) {
      const actualMin = Math.min(...values);
      const actualMax = Math.max(...values);
      setHighLowPrices({ high: actualMax, low: actualMin });
      const lastPoint = fullChartData[fullChartData.length - 1];
      if (
        lastPoint &&
        typeof lastPoint.value === "number" &&
        lastPoint.value > 0
      ) {
        setCurrentPrice(lastPoint.value);
      }
    } else {
      setHighLowPrices({ high: 0, low: 0 });
      setCurrentPrice(null);
    }
  }, [fullChartData]);

  useEffect(() => {
    const isValid =
      selectedToken &&
      selectedToken.currency &&
      selectedToken.issuer &&
      selectedToken.currency !== "Token" &&
      selectedToken.currency !== "Unknown";
    setHasValidToken(!!isValid);
    if (!isValid) {
      setChartData([]);
      setFullChartData([]);
      setDisplayData([]);
      setHighLowPrices({ high: 0, low: 0 });
      setCurrentPrice(null);
      setIsLoading(false);
      setError(null);
    }
  }, [selectedToken]);

  useEffect(() => {
    if (hasValidToken) {
      loadChartData(selectedToken);
    }
  }, [hasValidToken, selectedToken?.currency, selectedToken?.issuer]);

  if (!hasValidToken) {
    return (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            themes[theme]?.cardBackground
              ?.split(",")[0]
              ?.replace("linear-gradient(135deg, ", "")
              ?.replace(")", "") || "#0f1c2e",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "8px 15px",
            background: "rgba(39, 162, 219, 0.1)",
            borderBottom: `1px solid ${themes[theme]?.border || "#27a2db"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: "1rem",
              fontWeight: "bold",
              color: themes[theme]?.primary || "#27a2db",
              display: "flex",
              alignItems: "center",
              gap: "15px",
            }}
          >
            <span>📈 Tokens per XRP</span>
            {visiblePairsCount !== undefined && (
              <span
                style={{
                  fontSize: "1rem",
                  color: themes[theme]?.textSecondary || "#94a3b8",
                  fontWeight: "normal",
                }}
              >
                Active Trading Pairs: {visiblePairsCount}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "1rem",
              color: themes[theme]?.text || "#ffffff",
              fontWeight: "bold",
            }}
          >
            Loading...
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: themes[theme]?.textSecondary || "#e2e8f0",
            fontSize: "1rem",
            textAlign: "center",
            padding: "20px",
          }}
        >
          Select Asset from Token Positions to Launch Chart
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          themes[theme]?.cardBackground
            ?.split(",")[0]
            ?.replace("linear-gradient(135deg, ", "")
            ?.replace(")", "") || "#0f1c2e",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 15px",
          background: "rgba(39, 162, 219, 0.1)",
          borderBottom: `1px solid ${themes[theme]?.border || "#27a2db"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            color: themes[theme]?.primary || "#27a2db",
            display: "flex",
            alignItems: "center",
            gap: "15px",
          }}
        >
          <span>
            📈{" "}
            {selectedToken
              ? formatCurrencyCode(selectedToken.currency)
              : "Token"}
            /XRP
          </span>
          {visiblePairsCount !== undefined && (
            <span
              style={{
                fontSize: "0.8rem",
                color: themes[theme]?.textSecondary || "#94a3b8",
                fontWeight: "normal",
              }}
            ></span>
          )}
        </div>
        <div
          style={{
            fontSize: "0.9rem",
            color: themes[theme]?.text || "#ffffff",
            fontWeight: "bold",
          }}
        ></div>
      </div>
      {renderProgressBar()}
      <div
        style={{
          flex: 1,
          position: "relative",
          minHeight: "200px",
        }}
        ref={chartContainerRef}
      >
        {isLoading ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: themes[theme]?.textSecondary || "#e2e8f0",
              fontSize: "1.5rem",
            }}
          >
            <div style={{ marginBottom: "10px" }}>
              📈 Loading 7D Market Data...
            </div>
            <div
              style={{
                fontSize: "1.2rem",
                color: themes[theme]?.textSecondary,
              }}
            >
              {selectedToken
                ? formatCurrencyCode(selectedToken.currency)
                : "Token"}
              /XRP AMM+DEX Transactions Chart
            </div>
          </div>
        ) : error ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#f87171",
              fontSize: "0.9rem",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "1rem",
                fontWeight: "bold",
                marginBottom: "10px",
              }}
            >
              ⚠️ Chart Error
            </div>
            <div style={{ marginBottom: "15px" }}>{error}</div>
            <button
              onClick={() =>
                selectedToken ? loadChartData(selectedToken) : loadChartData()
              }
              style={{
                background: `linear-gradient(135deg, ${
                  themes[theme]?.primary || "#27a2db"
                }, ${themes[theme]?.secondary || "#60a5fa"})`,
                color: themes[theme]?.text || "#ffffff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "20px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.9rem",
              }}
            >
              🔄 Retry
            </button>
          </div>
        ) : displayData.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: themes[theme]?.textSecondary || "#e2e8f0",
              fontSize: "0.9rem",
            }}
          >
            <div style={{ marginBottom: "10px" }}>
              📉 No trading data available
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: themes[theme]?.textSecondary,
              }}
            >
              {selectedToken
                ? formatCurrencyCode(selectedToken.currency)
                : "Token"}
              /XRP Chart
            </div>
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%" }}>
            {renderSvgChart(displayData)}
          </div>
        )}
      </div>
      <div
        style={{
          padding: "8px 15px",
          background: "rgba(39, 162, 219, 0.05)",
          borderTop: `1px solid ${themes[theme]?.border || "#27a2db"}`,
          fontSize: "0.7rem",
          color: themes[theme]?.textSecondary || "#94a3b8",
          textAlign: "center",
        }}
      >
        {displayData.length > 0 && `${displayData.length} Data Points`}
      </div>
    </div>
  );
};

export default TokenChart;

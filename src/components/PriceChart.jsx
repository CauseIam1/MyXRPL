import React, { useState, useEffect, useRef } from "react";

const PriceChart = ({
  selectedPair,
  tokenPrices,
  theme,
  themes,
  fonts,
  fontFamily,
  isChartReady,
  transactions,
  visiblePairsCount = 0,
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
  const [hasValidPair, setHasValidPair] = useState(false);
  const [progress, setProgress] = useState({ message: "", percent: 0 });
  const [baseCurrency, setBaseCurrency] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [dataSource, setDataSource] = useState("");
  const CHART_CACHE_KEY = "chart_pair_data_cache_";

  const asciiToHex = (ascii) => {
    if (!ascii || ascii === "XRP") return ascii;
    if (ascii.length === 40 && /^[0-9A-F]+$/.test(ascii)) {
      return ascii;
    }
    if (ascii.length === 3 && /^[A-Z0-9]{3}$/.test(ascii)) {
      return ascii;
    }
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

  const cacheChartData = (pairKey, data, source) => {
    try {
      const cacheData = {
        data: data,
        timestamp: Date.now(),
        expires: Date.now() + 24 * 60 * 60 * 1000,
        pairKey: pairKey,
        source: source,
      };
      localStorage.setItem(
        `${CHART_CACHE_KEY}${pairKey}`,
        JSON.stringify(cacheData)
      );
    } catch (e) {}
  };

  const getCachedChartData = (pairKey) => {
    try {
      const cached = localStorage.getItem(`${CHART_CACHE_KEY}${pairKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.pairKey === pairKey && parsed.expires > Date.now()) {
          return { data: parsed.data, source: parsed.source };
        } else {
          localStorage.removeItem(`${CHART_CACHE_KEY}${pairKey}`);
        }
      }
    } catch (e) {
      localStorage.removeItem(`${CHART_CACHE_KEY}${pairKey}`);
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
    const buffer = range * 0.1;
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
    if (validData.length > 0) {
      const firstPoint = validData[0];
      const lastPoint = validData[validData.length - 1];
      if (
        firstPoint &&
        lastPoint &&
        isFinite(firstPoint.time) &&
        isFinite(lastPoint.time)
      ) {
        const startTime = new Date(firstPoint.time * 1000);
        const endTime = new Date(lastPoint.time * 1000);
        for (let i = 0; i <= 7; i++) {
          const timePoint = new Date(
            startTime.getTime() + (i * (endTime - startTime)) / 7
          );
          const xRatio =
            (timePoint.getTime() / 1000 - firstPoint.time) / fullTimeRange;
          const x = padding.left + xRatio * chartWidth;
          if (isFinite(x)) {
            const dateLabel = timePoint.toLocaleDateString([], {
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
            {formatNumber(currentPrice)} {priceLabel}
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
          {dataSource === "enhanced" && (
            <text
              x={10}
              y={74}
              fill="#fbbf24"
              fontSize="9"
              textAnchor="start"
              fontWeight="bold"
            >
              ⚠️ Enhanced with current rate
            </text>
          )}
          {dataSource === "current" && (
            <text
              x={10}
              y={74}
              fill="#fbbf24"
              fontSize="9"
              textAnchor="start"
              fontWeight="bold"
            >
              ⚠️ Current rate only
            </text>
          )}
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

  const getAmmPoolAddress = async (currency1, issuer1, currency2, issuer2) => {
    const hexCurrency1 = asciiToHex(currency1);
    const hexCurrency2 = asciiToHex(currency2);
    if (
      !isValidCurrencyCode(hexCurrency1) ||
      !isValidCurrencyCode(hexCurrency2)
    ) {
      return null;
    }
    if (hexCurrency1 !== "XRP" && (!issuer1 || !isValidXrpAddress(issuer1))) {
      return null;
    }
    if (hexCurrency2 !== "XRP" && (!issuer2 || !isValidXrpAddress(issuer2))) {
      return null;
    }

    const endpoints = [
      "wss://xrplcluster.com",
      "wss://s1.ripple.com:443",
      "wss://s2.ripple.com:51233",
    ];

    setProgress({
      message: `Searching for AMM pool for ${formatCurrencyCode(
        currency1
      )}/${formatCurrencyCode(currency2)}...`,
      percent: 10,
    });

    const combinations = [
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
    ];

    for (const endpoint of endpoints) {
      for (const combination of combinations) {
        try {
          const poolAddress = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Timeout"));
            }, 5000);
            const ws = new WebSocket(endpoint);
            ws.onopen = () => {
              try {
                const request = {
                  id: Date.now(),
                  command: "amm_info",
                  asset:
                    combination.asset1.currency === "XRP"
                      ? { currency: "XRP" }
                      : combination.asset1,
                  asset2:
                    combination.asset2.currency === "XRP"
                      ? { currency: "XRP" }
                      : combination.asset2,
                };
                ws.send(JSON.stringify(request));
              } catch (sendError) {
                clearTimeout(timeout);
                ws.close();
                reject(sendError);
              }
            };
            ws.onmessage = (event) => {
              clearTimeout(timeout);
              try {
                const data = JSON.parse(event.data);
                ws.close();
                if (data.result && data.result.amm && data.result.amm.account) {
                  resolve({
                    address: data.result.amm.account,
                    order: combination.order,
                    asset1: combination.asset1,
                    asset2: combination.asset2,
                  });
                } else {
                  resolve(null);
                }
              } catch (parseError) {
                ws.close();
                reject(parseError);
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

          if (poolAddress) {
            return poolAddress;
          }
        } catch (error) {}
      }
    }

    return null;
  };

  const fetchTransactions = async (account, isAmmPool = false) => {
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
          isAmmPool
        );
        if (transactions && transactions.length > 0) {
          return transactions;
        }
      } catch (error) {}
    }
    return [];
  };

  const fetchMultiplePages = async (endpoint, account, isAmmPool) => {
    let allTransactions = [];
    let marker = null;
    let pagesFetched = 0;
    const maxPages = 10;
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
          }, 15000);
          const ws = new WebSocket(endpoint);
          ws.onopen = () => {
            try {
              const request = {
                id: Date.now() + pagesFetched,
                command: "account_tx",
                account: account,
                ledger_index_min: -1,
                ledger_index_max: -1,
                limit: 200,
                forward: false,
                ...(marker ? { marker } : {}),
              };
              ws.send(JSON.stringify(request));
            } catch (sendError) {
              cleanup();
              resolve([]);
            }
          };
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.result && data.result.transactions) {
                let transactions = data.result.transactions;
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
          const progressPercent = Math.min(20 + pagesFetched * 10, 80);
          setProgress({
            message: `Fetching AMM transactions... Page ${pagesFetched} of ${maxPages}`,
            percent: progressPercent,
          });
          if (!marker) {
            break;
          }
          if (pagesFetched < maxPages && marker) {
            await new Promise((resolve) => setTimeout(resolve, 100));
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

  const extractTransactionData = (
    tx,
    asset1Currency,
    asset1Issuer,
    asset2Currency,
    asset2Issuer,
    assetOrder
  ) => {
    try {
      const meta = tx.meta || tx.metaData;
      if (!meta || !tx.tx) return null;
      const hexCurrency1 =
        asset1Currency.length <= 3
          ? asset1Currency
          : asciiToHex(asset1Currency);
      const hexCurrency2 =
        asset2Currency.length <= 3
          ? asset2Currency
          : asciiToHex(asset2Currency);
      if (tx.tx.TransactionType === "Payment") {
        const sent = tx.tx.SendMax || tx.tx.Amount;
        const delivered = meta.DeliveredAmount || tx.tx.Amount;
        let asset1Amount = 0;
        let asset2Amount = 0;
        let hasAsset1 = false;
        let hasAsset2 = false;
        if (sent && typeof sent === "object") {
          if (sent.currency === hexCurrency1 && sent.issuer === asset1Issuer) {
            asset1Amount = parseFloat(sent.value);
            hasAsset1 = true;
          } else if (
            sent.currency === hexCurrency2 &&
            sent.issuer === asset2Issuer
          ) {
            asset2Amount = parseFloat(sent.value);
            hasAsset2 = true;
          }
        }
        if (delivered && typeof delivered === "object") {
          if (
            delivered.currency === hexCurrency1 &&
            delivered.issuer === asset1Issuer
          ) {
            asset1Amount = parseFloat(delivered.value);
            hasAsset1 = true;
          } else if (
            delivered.currency === hexCurrency2 &&
            delivered.issuer === asset2Issuer
          ) {
            asset2Amount = parseFloat(delivered.value);
            hasAsset2 = true;
          }
        }
        if (
          !hasAsset1 ||
          !hasAsset2 ||
          asset1Amount <= 0 ||
          asset2Amount <= 0
        ) {
          return null;
        }
        let price, volume;
        if (assetOrder === "normal") {
          price = asset2Amount / asset1Amount;
          volume = asset1Amount;
        } else {
          price = asset1Amount / asset2Amount;
          volume = asset2Amount;
        }
        const timestamp = tx.tx.date + 946684800;
        if (price > 0 && isFinite(price)) {
          return {
            time: timestamp,
            value: price,
            volume: volume,
            asset1Amount: asset1Amount,
            asset2Amount: asset2Amount,
          };
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
      (tx) => tx.time && tx.time >= startTime && tx.time <= now
    );
    if (recentTransactions.length === 0) {
      return [];
    }
    recentTransactions.sort((a, b) => a.time - b.time);
    const values = recentTransactions
      .map((tx) => tx.value)
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
      if (!tx.value || !isFinite(tx.value)) return false;
      const inBounds = tx.value >= lowerBound && tx.value <= upperBound;
      return inBounds;
    });
    const data = [];
    const interval = 3600;
    const hourlyBuckets = {};
    for (let time = startTime; time <= now; time += interval) {
      const hourBucket = Math.floor(time / 3600) * 3600;
      hourlyBuckets[hourBucket] = {
        transactions: [],
        totalValue: 0,
        totalVolume: 0,
      };
    }
    recentTransactions.forEach((tx) => {
      if (tx.time && tx.value > 0 && isFinite(tx.value)) {
        const hourBucket = Math.floor(tx.time / 3600) * 3600;
        if (hourlyBuckets[hourBucket]) {
          hourlyBuckets[hourBucket].transactions.push(tx);
          hourlyBuckets[hourBucket].totalValue += tx.value * tx.volume;
          hourlyBuckets[hourBucket].totalVolume += tx.volume;
        }
      }
    });
    Object.keys(hourlyBuckets).forEach((hourKey) => {
      const bucket = hourlyBuckets[hourKey];
      if (bucket.totalVolume > 0) {
        const avgValue = bucket.totalValue / bucket.totalVolume;
        const totalVol = bucket.totalVolume;
        if (avgValue > 0 && isFinite(avgValue)) {
          data.push({
            time: parseInt(hourKey) + 1800,
            value: avgValue,
            volume: Math.round(totalVol * 1000000) / 1000000,
          });
        }
      }
    });
    data.sort((a, b) => a.time - b.time);
    setProgress({ message: "Finalizing chart...", percent: 95 });
    return data;
  };

  const determineBaseCurrency = (pair, tokenPrices) => {
    const priceKey1 = `${pair.currency1}-${pair.issuer1}`;
    const priceKey2 = `${pair.currency2}-${pair.issuer2}`;
    const currentPrice1 = tokenPrices[priceKey1];
    const currentPrice2 = tokenPrices[priceKey2];
    let isAsset1Higher = false;
    if (currentPrice1 && currentPrice2) {
      isAsset1Higher = currentPrice1 >= currentPrice2;
    } else if (currentPrice1) {
      isAsset1Higher = true;
    } else if (currentPrice2) {
      isAsset1Higher = false;
    } else {
      isAsset1Higher = true;
    }
    return isAsset1Higher;
  };

  const calculateCurrentRate = (
    pair,
    tokenPrices,
    isAsset1Higher,
    assetOrder
  ) => {
    try {
      const priceKey1 = `${pair.currency1}-${pair.issuer1}`;
      const priceKey2 = `${pair.currency2}-${pair.issuer2}`;
      const price1 = tokenPrices[priceKey1];
      const price2 = tokenPrices[priceKey2];
      if (!price1 || price1 <= 0 || !price2 || price2 <= 0) {
        return null;
      }
      let ratio;
      if (isAsset1Higher) {
        ratio = price2 / price1;
      } else {
        ratio = price1 / price2;
      }
      if (assetOrder) {
        if (isAsset1Higher) {
          if (assetOrder === "normal") {
            ratio = ratio;
          } else {
            ratio = 1 / ratio;
          }
        } else {
          if (assetOrder === "normal") {
            ratio = 1 / ratio;
          } else {
            ratio = ratio;
          }
        }
      }
      return ratio;
    } catch (error) {
      return null;
    }
  };

  const enhanceWithCurrentRate = (
    existingData,
    pair,
    tokenPrices,
    assetOrder,
    isAsset1Higher
  ) => {
    try {
      if (existingData.length === 0) return existingData;
      const currentRate = calculateCurrentRate(
        pair,
        tokenPrices,
        isAsset1Higher,
        assetOrder
      );
      if (currentRate === null || currentRate <= 0) {
        return existingData;
      }
      const lastPoint = existingData[existingData.length - 1];
      const now = Math.floor(Date.now() / 1000);
      if (existingData.length <= 3 || now - lastPoint.time > 3600) {
        const enhancedData = [...existingData];
        enhancedData.push({
          time: now,
          value: currentRate,
          volume: 0,
          isCurrentRate: true,
        });
        setDataSource("enhanced");
        return enhancedData;
      }
      return existingData;
    } catch (error) {
      return existingData;
    }
  };

  const getCurrentRateOnlyData = (pair, tokenPrices) => {
    try {
      const isAsset1Higher = determineBaseCurrency(pair, tokenPrices);
      const currentRate = calculateCurrentRate(
        pair,
        tokenPrices,
        isAsset1Higher,
        null
      );
      if (currentRate === null || currentRate <= 0) {
        return [];
      }
      if (isAsset1Higher) {
        setBaseCurrency(formatCurrencyCode(pair.currency1));
        setQuoteCurrency(formatCurrencyCode(pair.currency2));
        setPriceLabel(
          `${formatCurrencyCode(pair.currency2)} per ${formatCurrencyCode(
            pair.currency1
          )}`
        );
      } else {
        setBaseCurrency(formatCurrencyCode(pair.currency2));
        setQuoteCurrency(formatCurrencyCode(pair.currency1));
        setPriceLabel(
          `${formatCurrencyCode(pair.currency1)} per ${formatCurrencyCode(
            pair.currency2
          )}`
        );
      }
      return [
        {
          time: Math.floor(Date.now() / 1000),
          value: currentRate,
          volume: 0,
          isCurrentRate: true,
        },
      ];
    } catch (error) {
      return [];
    }
  };

  const loadChartData = async (pair) => {
    if (
      !pair ||
      !pair.currency1 ||
      !pair.issuer1 ||
      !pair.currency2 ||
      !pair.issuer2
    ) {
      setFullChartData([]);
      setDisplayData([]);
      return;
    }
    const pairKey = `${pair.currency1}-${pair.issuer1}→${pair.currency2}-${pair.issuer2}`;
    setProgress({ message: "Checking cache...", percent: 5 });
    const cachedResult = getCachedChartData(pairKey);
    if (cachedResult) {
      setFullChartData(cachedResult.data);
      setDisplayData(cachedResult.data);
      setDataSource(cachedResult.source || "amm");
      setIsLoading(false);
      setProgress({ message: "", percent: 0 });
      const isAsset1Higher = determineBaseCurrency(pair, tokenPrices);
      if (isAsset1Higher) {
        setBaseCurrency(formatCurrencyCode(pair.currency1));
        setQuoteCurrency(formatCurrencyCode(pair.currency2));
        setPriceLabel(
          `${formatCurrencyCode(pair.currency2)} per ${formatCurrencyCode(
            pair.currency1
          )}`
        );
      } else {
        setBaseCurrency(formatCurrencyCode(pair.currency2));
        setQuoteCurrency(formatCurrencyCode(pair.currency1));
        setPriceLabel(
          `${formatCurrencyCode(pair.currency1)} per ${formatCurrencyCode(
            pair.currency2
          )}`
        );
      }
      return;
    }
    setProgress({ message: "Initializing chart data...", percent: 10 });
    setChartData([]);
    setIsLoading(true);
    setError(null);
    setDataSource("");
    try {
      setProgress({ message: "Searching for AMM pool...", percent: 15 });
      const poolResult = await getAmmPoolAddress(
        pair.currency1,
        pair.issuer1,
        pair.currency2,
        pair.issuer2
      );
      let finalData = [];
      let source = "current";
      let assetOrder = null;
      let isAsset1Higher = false;
      if (poolResult) {
        const { address: poolAddress, order: detectedAssetOrder } = poolResult;
        assetOrder = detectedAssetOrder;
        setProgress({ message: "Fetching AMM transactions...", percent: 20 });
        const ammTransactions = await fetchTransactions(poolAddress, true);
        if (ammTransactions && ammTransactions.length > 0) {
          setProgress({
            message: "Processing transaction data...",
            percent: 70,
          });
          const ammData = ammTransactions
            .map((tx) =>
              extractTransactionData(
                tx,
                pair.currency1,
                pair.issuer1,
                pair.currency2,
                pair.issuer2,
                assetOrder
              )
            )
            .filter((data) => data !== null);
          if (ammData.length > 0) {
            isAsset1Higher = determineBaseCurrency(pair, tokenPrices);
            const processedData = processChartData(ammData).map((point) => {
              let newValue = point.value;
              if (isAsset1Higher) {
                if (assetOrder === "normal") {
                  newValue = point.value;
                } else {
                  newValue = 1 / point.value;
                }
              } else {
                if (assetOrder === "normal") {
                  newValue = 1 / point.value;
                } else {
                  newValue = point.value;
                }
              }
              return {
                ...point,
                value: newValue,
              };
            });
            let enhancedData = processedData;
            if (processedData.length <= 5) {
              enhancedData = enhanceWithCurrentRate(
                processedData,
                pair,
                tokenPrices,
                assetOrder,
                isAsset1Higher
              );
            }
            finalData = enhancedData;
            source = finalData.some((point) => point.isCurrentRate)
              ? processedData.length > 0
                ? "enhanced"
                : "current"
              : "amm";
          }
        }
      }
      if (finalData.length === 0) {
        finalData = getCurrentRateOnlyData(pair, tokenPrices);
        source = "current";
      }
      if (finalData.length > 0) {
        if (isAsset1Higher) {
          setBaseCurrency(formatCurrencyCode(pair.currency1));
          setQuoteCurrency(formatCurrencyCode(pair.currency2));
          setPriceLabel(
            `${formatCurrencyCode(pair.currency2)} per ${formatCurrencyCode(
              pair.currency1
            )}`
          );
        } else {
          setBaseCurrency(formatCurrencyCode(pair.currency2));
          setQuoteCurrency(formatCurrencyCode(pair.currency1));
          setPriceLabel(
            `${formatCurrencyCode(pair.currency1)} per ${formatCurrencyCode(
              pair.currency2
            )}`
          );
        }
        cacheChartData(pairKey, finalData, source);
        setFullChartData(finalData);
        setDisplayData(finalData);
        setChartData(finalData);
        setDataSource(source);
        setIsLoading(false);
        setProgress({ message: "", percent: 0 });
        return;
      }
      throw new Error("No chart data available after processing");
    } catch (err) {
      setError(`Chart error: ${err.message}`);
      setIsLoading(false);
      setChartData([]);
      setFullChartData([]);
      setDisplayData([]);
      setProgress({ message: "", percent: 0 });
      try {
        const fallbackData = getCurrentRateOnlyData(selectedPair, tokenPrices);
        if (fallbackData.length > 0) {
          const isAsset1Higher = determineBaseCurrency(
            selectedPair,
            tokenPrices
          );
          if (isAsset1Higher) {
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
          setFullChartData(fallbackData);
          setDisplayData(fallbackData);
          setChartData(fallbackData);
          setDataSource("current");
          setError(null);
        }
      } catch (fallbackError) {}
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
      selectedPair &&
      selectedPair.currency1 &&
      selectedPair.issuer1 &&
      selectedPair.currency2 &&
      selectedPair.issuer2;
    setHasValidPair(!!isValid);
    if (!isValid) {
      setChartData([]);
      setFullChartData([]);
      setDisplayData([]);
      setHighLowPrices({ high: 0, low: 0 });
      setCurrentPrice(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    loadChartData(selectedPair);
  }, [selectedPair, tokenPrices]);
  if (!hasValidPair) {
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
            <span>📈 Asset Pair Chart</span>
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
          Select Asset Pair from Pairs Section to Launch Chart
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
            📈 Tokens of {formatCurrencyCode(selectedPair.currency1)} for 1{" "}
            {formatCurrencyCode(selectedPair.currency2)}
          </span>
        </div>
        <div
          style={{
            fontSize: "0.9rem",
            color: themes[theme]?.text || "#ffffff",
            fontWeight: "bold",
            textAlign: "right",
            maxWidth: "50%",
          }}
        >
          Active Trading Pairs: {visiblePairsCount}
        </div>
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
              {formatCurrencyCode(selectedPair.currency1)}/
              {formatCurrencyCode(selectedPair.currency2)} AMM Transactions
              Chart
            </div>
          </div>
        ) : error && dataSource !== "current" ? (
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
              onClick={() => loadChartData(selectedPair)}
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
              {formatCurrencyCode(selectedPair.currency1)}/
              {formatCurrencyCode(selectedPair.currency2)} Chart
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
        {dataSource === "enhanced" && (
          <div style={{ marginTop: "2px", color: "#fbbf24" }}>
            ⚠️ Enhanced with current exchange rate - Forward looking momentum
          </div>
        )}
        {dataSource === "current" && (
          <div style={{ marginTop: "2px", color: "#fbbf24" }}>
            ⚠️ Current exchange rate only
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceChart;

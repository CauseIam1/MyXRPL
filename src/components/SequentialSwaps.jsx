import React from "react";

const SequentialSwaps = ({
  batchReverseLoading,
  arbitrageChains,
  transactions,
  reverseQuotes,
  chainProfitThreshold,
  setChainProfitThreshold,
  getSwapGroups,
  findArbitrageChains,
  setArbitrageChains,
  themes,
  theme,
  fonts,
  fontFamily,
  hexToRgb,
  formatCurrencyCode,
}) => {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {batchReverseLoading ? (
        <div
          style={{
            background: themes[theme].cardBackground,
            borderRadius: "15px",
            padding: "15px",
            border: `2px solid ${themes[theme].border}`,
            height: "100%",
            boxShadow: `0 4px 15px rgba(${hexToRgb(
              themes[theme].primary
            )}, 0.2)`,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            fontFamily: fonts[fontFamily],
            flex: 1,
          }}
        >
          <h3
            style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: themes[theme].primary,
              marginBottom: "10px",
              fontFamily: fonts[fontFamily],
            }}
          >
            🔗 Sequential Swaps
          </h3>
          <div
            style={{
              width: "30px",
              height: "30px",
              border: `3px solid rgba(${hexToRgb(themes[theme].primary)}, 0.3)`,
              borderTop: `3px solid ${themes[theme].primary}`,
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "15px",
            }}
          ></div>
          <p
            style={{
              color: themes[theme].textSecondary,
              fontSize: "0.9rem",
              textAlign: "center",
              fontFamily: fonts[fontFamily],
            }}
          >
            Waiting for AMM data to load...
          </p>
          <p
            style={{
              color: themes[theme].secondary,
              fontSize: "0.8rem",
              marginTop: "5px",
              fontFamily: fonts[fontFamily],
            }}
          >
            {Object.keys(reverseQuotes).length} pairs processed
          </p>
        </div>
      ) : arbitrageChains.length === 0 && transactions.length > 0 ? (
        <div
          style={{
            background: themes[theme].cardBackground,
            borderRadius: "15px",
            padding: "15px",
            border: `2px solid ${themes[theme].border}`,
            height: "100%",
            boxShadow: `0 4px 15px rgba(${hexToRgb(
              themes[theme].primary
            )}, 0.2)`,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            fontFamily: fonts[fontFamily],
            flex: 1,
          }}
        >
          <h3
            style={{
              fontSize: "2rem",
              fontWeight: "bold",
              color: themes[theme].primary,
              textAlign: "center",
              marginBottom: "10px",
              fontFamily: fonts[fontFamily],
            }}
          >
            🔗 Sequential Swaps
          </h3>
          <p
            style={{
              color: themes[theme].textSecondary,
              fontSize: "0.9rem",
              textAlign: "center",
              fontFamily: fonts[fontFamily],
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
              <span
                style={{
                  color: themes[theme].textSecondary,
                  fontSize: "0.8rem",
                  fontFamily: fonts[fontFamily],
                }}
              >
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
                  color: themes[theme].secondary,
                  fontSize: "0.8rem",
                  minWidth: "40px",
                  fontFamily: fonts[fontFamily],
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
                background: `linear-gradient(135deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
                color: themes[theme].text,
                border: `1px solid ${themes[theme].border}`,
                padding: "4px 12px",
                borderRadius: "15px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.8rem",
                fontFamily: fonts[fontFamily],
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      ) : arbitrageChains.length > 0 ? (
        <div
          style={{
            background: themes[theme].cardBackground,
            borderRadius: "15px",
            padding: "12px",
            border: `2px solid ${themes[theme].border}`,
            boxShadow: `0 4px 15px rgba(${hexToRgb(
              themes[theme].primary
            )}, 0.2)`,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            fontFamily: fonts[fontFamily],
            flex: 1,
          }}
        >
          <h3
            style={{
              fontSize: "2rem",
              fontWeight: "bold",
              color: themes[theme].primary,
              marginBottom: "8px",
              textAlign: "center",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              fontFamily: fonts[fontFamily],
            }}
          >
            <span>🔗 Sequential Swaps ({arbitrageChains.length})</span>
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
                  color: themes[theme].secondary,
                  fontSize: "0.7rem",
                  minWidth: "40px",
                  fontFamily: fonts[fontFamily],
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
                background: `linear-gradient(135deg, ${themes[theme].primary}, ${themes[theme].secondary})`,
                color: themes[theme].text,
                border: `1px solid ${themes[theme].border}`,
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
                fontFamily: fonts[fontFamily],
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
                  background: `rgba(${hexToRgb(themes[theme].primary)}, 0.1)`,
                  borderRadius: "8px",
                  padding: "8px",
                  marginBottom: "6px",
                  border: `1px solid rgba(${hexToRgb(
                    themes[theme].primary
                  )}, 0.3)`,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: themes[theme].secondary,
                    marginBottom: "4px",
                    fontSize: "0.85rem",
                    fontFamily: fonts[fontFamily],
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
                        color: themes[theme].textSecondary,
                        fontSize: "0.7rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        fontFamily: fonts[fontFamily],
                      }}
                    >
                      {chain.pairs.map((pair, pairIndex) => (
                        <span key={pairIndex}>
                          {formatCurrencyCode(pair.fromCurrency)}→
                          {formatCurrencyCode(pair.toCurrency)}
                          <span
                            style={{
                              color: "#4ade80",
                              fontFamily: fonts[fontFamily],
                            }}
                          >
                            ({pair.profitPercent.toFixed(2)}%)
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
                        fontFamily: fonts[fontFamily],
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
      ) : null}
    </div>
  );
};

export default SequentialSwaps;

// src/components/VerticalResizableSplitView.jsx
import React, { useState, useEffect, useRef } from "react";

const VerticalResizableSplitView = ({ top, bottom }) => {
  const [isResizing, setIsResizing] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50); // percentage
  const containerRef = useRef(null);

  const startResizing = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const stopResizing = () => {
    setIsResizing(false);
  };

  const resize = (e) => {
    if (isResizing && containerRef.current) {
      const container = containerRef.current;
      const containerHeight = container.offsetHeight;
      if (containerHeight > 0) {
        const rect = container.getBoundingClientRect();
        const newPosition = ((e.clientY - rect.top) / containerHeight) * 100;
        // Keep position between 20% and 80%
        setSplitPosition(Math.min(Math.max(newPosition, 20), 80));
      }
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => resize(e);
    const handleMouseUp = () => stopResizing();

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        padding: "6px", // Increased spacing
        boxSizing: "border-box",
      }}
    >
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          position: "relative",
          minHeight: "0",
          borderRadius: "4px",
        }}
        onMouseMove={resize}
        onMouseUp={stopResizing}
        onMouseLeave={stopResizing}
      >
        <div
          style={{
            height: `calc(${splitPosition}% - 6px)`, // Increased from 4px to 6px
            width: "100%",
            overflow: "hidden",
            marginBottom: "4px", // Increased spacing
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: "1",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "auto",
              paddingBottom: "6px", // Add space at bottom
            }}
          >
            {top}
          </div>
        </div>

        <div
          style={{
            height: "6px", // Increased from 6px to 8px
            backgroundColor: "#27a2db",
            cursor: "row-resize",
            position: "relative",
            zIndex: 10,
            borderRadius: "4px",
            flexShrink: 0,
          }}
          onMouseDown={startResizing}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "24px",
              height: "24px",
              backgroundColor: "#27a2db",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "row-resize",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              zIndex: 11,
            }}
          >
            <div style={{ color: "white", fontSize: "12px" }}>⋯</div>
          </div>
        </div>

        <div
          style={{
            height: `calc(${100 - splitPosition}% - 6px)`, // Increased from 4px to 6px
            width: "100%",
            overflow: "hidden",
            marginTop: "6px", // Increased spacing
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: "1",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "auto",
              paddingTop: "8px", // Add space at top
            }}
          >
            {bottom}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerticalResizableSplitView;

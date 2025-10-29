// src/components/ResizableSplitView.jsx
import React, { useState, useEffect, useRef } from "react";

const ResizableSplitView = ({ left, right }) => {
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
      const containerWidth = container.offsetWidth;
      if (containerWidth > 0) {
        const newPosition =
          ((e.clientX - container.getBoundingClientRect().left) /
            containerWidth) *
          100;
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
        padding: "4px", // Increased spacing
        boxSizing: "border-box",
      }}
    >
      <div
        ref={containerRef}
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          position: "relative",
          minHeight: "0",
          borderRadius: "6px",
        }}
        onMouseMove={resize}
        onMouseUp={stopResizing}
        onMouseLeave={stopResizing}
      >
        <div
          style={{
            width: `calc(${splitPosition}% - 6px)`, // Increased from 4px to 6px
            height: "100%",
            overflow: "hidden",
            marginRight: "6px", // Increased spacing
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
              paddingRight: "6px", // Add space for scrollbar
            }}
          >
            {left}
          </div>
        </div>

        <div
          style={{
            width: "8px", // Increased from 6px to 8px
            backgroundColor: "#27a2db",
            cursor: "col-resize",
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
              cursor: "col-resize",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              zIndex: 11,
            }}
          >
            <div style={{ color: "white", fontSize: "12px" }}>⋮</div>
          </div>
        </div>

        <div
          style={{
            width: `calc(${100 - splitPosition}% - 6px)`, // Increased from 4px to 6px
            height: "100%",
            overflow: "hidden",
            marginLeft: "6px", // Increased spacing
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
            }}
          >
            {right}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResizableSplitView;

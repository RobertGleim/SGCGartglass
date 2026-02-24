import React from "react";

export default function Layout({ children }) {
  return (
    <div className="layout">
      {/* Header, nav, etc. can be added here */}
      {children}
    </div>
  );
}

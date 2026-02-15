import React from "react";

/**
 * Badge que muestra el modo actual (CAJA o MESERO)
 * FASE 18.1: Separación visual por roles
 */
export default function RoleBadge({ role }) {
  const isCaja = role === "CAJA";
  const label = isCaja ? "MODO CAJA" : role === "MESERO" ? "MODO MESERO" : role || "MODO";

  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    border: `1px solid ${isCaja ? "#1f7a1f" : "#1e5aa8"}`,
    color: isCaja ? "#1f7a1f" : "#1e5aa8",
    background: isCaja ? "#eaf7ea" : "#eaf2ff",
    whiteSpace: "nowrap",
  };

  return <span style={style}>{label}</span>;
}

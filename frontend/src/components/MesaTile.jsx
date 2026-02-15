import './PlanoMesas.css';

export default function MesaTile({ table, layout, onClick, customStyle }) {
  const { id, x, y, w, h } = layout;
  
  // Buscar datos de la mesa en el array de tables
  const tableData = table || { id, number: id, status: 'libre' };
  const mesaNumber = tableData.number || tableData.id || id;
  
  const getMesaLabel = () => {
    // Para mesas 9 y 10, usar etiqueta especial
    if (mesaNumber === 9) return 'VENTANILLA';
    if (mesaNumber === 10) return 'DOMICILIOS';
    return tableData.label || `Mesa ${mesaNumber}`;
  };

  const getStatusClass = (status) => {
    const classes = {
      libre: 'mesa-libre',
      pedido_activo: 'mesa-activa',
      pedido_listo: 'mesa-lista'
    };
    return classes[status] || 'mesa-libre';
  };

  const getStatusLabel = (status) => {
    const labels = {
      libre: 'Libre',
      pedido_activo: 'Activa',
      pedido_listo: 'Lista'
    };
    return labels[status] || 'Libre';
  };

  // Estilos base
  const baseStyle = {
    position: 'absolute',
    left: `${x}%`,
    top: `${y}%`,
    width: `${w}%`,
    height: `${h}%`,
  };

  // Aplicar estilos personalizados si existen (para mesas 9 y 10)
  const finalStyle = customStyle ? { ...baseStyle, ...customStyle } : baseStyle;

  return (
    <div
      className={`mesa-tile ${getStatusClass(tableData.status)}`}
      style={finalStyle}
      onClick={() => onClick(tableData)}
    >
      <div className="mesa-number">{mesaNumber}</div>
      <div className="mesa-label">{getMesaLabel()}</div>
      <div className="mesa-status">{getStatusLabel(tableData.status)}</div>
    </div>
  );
}

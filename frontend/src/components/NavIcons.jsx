import Icon from './ui/Icon';

// Iconos de navegación (mesero/BottomNav y otras barras). Rediseño 2026-10:
// delegan en ui/Icon (familia Lucide + animaciones de Lucide Animated) para
// que todo el POS use UNA sola familia. Se mantienen los mismos nombres de
// export para no tocar a quienes ya los importan.
export function IconCocina(props) {
  return <Icon name="cocina" size={24} {...props} />;
}

export function IconCobrar(props) {
  return <Icon name="cobrar" size={24} {...props} />;
}

export function IconResumen(props) {
  return <Icon name="resumen" size={24} {...props} />;
}

export function IconMenu(props) {
  return <Icon name="admin" size={24} {...props} />;
}

export function IconPedidos(props) {
  return <Icon name="ordenes" size={24} {...props} />;
}

export function IconPlus(props) {
  return <Icon name="plus" size={24} strokeWidth={2.4} {...props} />;
}

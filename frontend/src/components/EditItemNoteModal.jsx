import ItemOptionsSheet from './ItemOptionsSheet';

/**
 * Editar un item YA agregado (pendiente de enviar o ya en la orden) — antes,
 * una vez agregado un producto quedaba fijo: para corregir "se me olvidó la
 * salsa" había que anularlo y volver a agregarlo. Es el mismo panel que abre
 * ProductPicker al tocar un producto (ItemOptionsSheet), en modo edición.
 *
 * `item`: { name, qty, notes, specialNote|special_note, price, product_id, category }
 * `product`: la fila de /products correspondiente (opcional: sabores/adicionales).
 * `adicionales` + `allowAdicionales`: solo para items LOCALES (aún no enviados),
 *   porque cambiar adicionales cambia el precio y el PATCH de un item ya en la
 *   orden solo deja al mesero tocar notas/nota especial (price es de CAJA).
 * `allowQty`: igual, solo para items locales.
 * `onSave({ notes, specialNote, price, qty })`: async (PATCH) o sync (estado local).
 *   notes/specialNote llegan como null cuando quedan vacíos (contrato anterior).
 */
export default function EditItemNoteModal({
  open,
  item,
  product,
  onClose,
  onSave,
  adicionales = [],
  allowAdicionales = false,
  allowQty = false,
}) {
  if (!item) return null;
  return (
    <ItemOptionsSheet
      open={open}
      mode="edit"
      product={product}
      item={item}
      adicionales={adicionales}
      allowQty={allowQty}
      allowAdicionales={allowAdicionales}
      onClose={onClose}
      onSubmit={({ notes, specialNote, price, qty }) =>
        onSave({ notes: notes || null, specialNote: specialNote || null, price, qty })}
    />
  );
}

import Modal from './Modal';

/**
 * Renderiza los modales de alerta/confirmación/prompt de la marca.
 * Recibe directamente lo que devuelven useAlert/useConfirm/usePrompt:
 *   <ModalHost alertApi={useAlert()} confirmApi={useConfirm()} promptApi={usePrompt()} />
 * (cualquiera de los tres es opcional)
 */
export default function ModalHost({ alertApi, confirmApi, promptApi }) {
  return (
    <>
      {alertApi && (
        <Modal
          open={alertApi.alertState.open}
          onClose={alertApi.closeAlert}
          title={alertApi.alertState.title}
          actions={<button className="btn-chanatos" onClick={alertApi.closeAlert}>OK</button>}
        >
          <p style={{ whiteSpace: 'pre-line' }}>{alertApi.alertState.message}</p>
        </Modal>
      )}
      {confirmApi && (
        <Modal
          open={confirmApi.confirmState.open}
          onClose={confirmApi.cancelConfirm}
          title={confirmApi.confirmState.title}
          actions={<>
            <button className="btn-secondary" onClick={confirmApi.cancelConfirm}>Cancelar</button>
            <button className="btn-chanatos" onClick={confirmApi.acceptConfirm}>Aceptar</button>
          </>}
        >
          <p style={{ whiteSpace: 'pre-line' }}>{confirmApi.confirmState.message}</p>
        </Modal>
      )}
      {promptApi && (
        <Modal
          open={promptApi.promptState.open}
          onClose={promptApi.cancelPrompt}
          title={promptApi.promptState.title}
          actions={<>
            <button className="btn-secondary" onClick={promptApi.cancelPrompt}>Cancelar</button>
            <button className="btn-chanatos" onClick={promptApi.acceptPrompt}>Aceptar</button>
          </>}
        >
          <p style={{ whiteSpace: 'pre-line' }}>{promptApi.promptState.message}</p>
          <input
            type="text"
            value={promptApi.promptState.value}
            placeholder={promptApi.promptState.placeholder}
            onChange={(e) => promptApi.setPromptValue(e.target.value)}
            autoFocus
            style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e5e5e5', borderRadius: '8px', fontSize: '0.95rem', marginTop: '0.5rem' }}
          />
        </Modal>
      )}
    </>
  );
}

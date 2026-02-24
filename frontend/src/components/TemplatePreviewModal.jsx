import styles from './TemplatePreviewModal.module.css';

export default function TemplatePreviewModal({ template, onClose }) {
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={`Preview of ${template.name}`}>
      <div className={styles.modalContent}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close preview">×</button>
        <div className={styles.previewImageWrapper}>
          <img
            src={template.previewUrl}
            alt={template.name}
            width={500}
            height={500}
            className={styles.previewImage}
          />
        </div>
        <div className={styles.specs}>
          <h2>{template.name}</h2>
          <div className={styles.specRow}><strong>Category:</strong> {template.category}</div>
          <div className={styles.specRow}><strong>Difficulty:</strong> {template.difficulty}</div>
          <div className={styles.specRow}><strong>Piece Count:</strong> {template.pieceCount}</div>
          <div className={styles.specRow}><strong>Dimensions:</strong> {template.dimensions}</div>
        </div>
        <div className={styles.actions}>
          <button className={styles.startBtn} onClick={() => window.location.href = `/designer?template=${template.id}`} aria-label="Start designing">Start Designing</button>
          <button className={styles.cancelBtn} onClick={onClose} aria-label="Cancel">Cancel</button>
        </div>
      </div>
    </div>
  );
}

import { forwardRef } from 'react';
import styles from './TemplateCard.module.css';

const TemplateCard = forwardRef(({ template, onClick }, ref) => {
  return (
    <div
      className={styles.card}
      tabIndex={0}
      role="button"
      aria-label={`Preview template ${template.name}`}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' ? onClick() : null)}
      ref={ref}
    >
      <div className={styles.thumbnailWrapper}>
        <img
          src={template.thumbnailUrl}
          alt={template.name}
          width={300}
          height={300}
          loading="lazy"
          className={styles.thumbnail}
        />
        <span className={styles.categoryBadge}>{template.category}</span>
      </div>
      <div className={styles.info}>
        <h3 className={styles.name}>{template.name}</h3>
        <div className={styles.meta}>
          <span className={styles.difficulty}>{template.difficulty}</span>
          <span className={styles.pieceCount}>{template.pieceCount} pieces</span>
        </div>
      </div>
    </div>
  );
});

export default TemplateCard;

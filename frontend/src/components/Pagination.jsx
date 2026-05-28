import styles from './Pagination.module.css'

const buildPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items = [1]
  let start = Math.max(2, currentPage - 1)
  let end = Math.min(totalPages - 1, currentPage + 1)

  if (currentPage <= 3) {
    end = 4
  }

  if (currentPage >= totalPages - 2) {
    start = totalPages - 3
  }

  if (start > 2) {
    items.push('start-ellipsis')
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page)
  }

  if (end < totalPages - 1) {
    items.push('end-ellipsis')
  }

  items.push(totalPages)
  return items
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  ariaLabel = 'Pagination',
  metaText = '',
}) {
  if (totalPages <= 1) return null

  const items = buildPageItems(currentPage, totalPages)

  return (
    <div>
      <div className={styles.pagination} role="navigation" aria-label={ariaLabel}>
        <button
          type="button"
          className={styles.button}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          Prev
        </button>

        {items.map((item) => {
          if (typeof item !== 'number') {
            return (
              <span key={item} className={styles.ellipsis} aria-hidden="true">
                ...
              </span>
            )
          }

          return (
            <button
              key={`page-${item}`}
              type="button"
              className={`${styles.button} ${currentPage === item ? styles.active : ''}`}
              aria-current={currentPage === item ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          )
        })}

        <button
          type="button"
          className={styles.button}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          Next
        </button>
      </div>
      {metaText ? <p className={styles.meta}>{metaText}</p> : null}
    </div>
  )
}
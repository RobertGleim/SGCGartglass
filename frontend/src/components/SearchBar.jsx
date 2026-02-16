import '../styles/SearchBar.css'

export default function SearchBar({ search, setSearch, totalItems = 0 }) {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder={`Search all ${totalItems} items`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <button className="search-btn" aria-label="Search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
      </button>
    </div>
  )
}

interface Props {
  value: string
  onChange: (v: string) => void
  searching: boolean
}

export function SearchBar({ value, onChange, searching }: Props): JSX.Element {
  return (
    <div className="searchbar">
      <span className="search-icon">🔍</span>
      <input
        className="search-input"
        type="text"
        placeholder="搜索对话标题或内容(内容搜索需 ≥ 3 个字符)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
      {value && (
        <button className="clear-btn" onClick={() => onChange('')} title="清除">
          ✕
        </button>
      )}
      {searching && <span className="searching-dot">…</span>}
    </div>
  )
}

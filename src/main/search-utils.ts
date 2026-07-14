// 纯逻辑:搜索查询的转义构造。与 better-sqlite3 无关,便于单测。

/** 转义 LIKE 通配符(配合 SQL 里的 ESCAPE '\' 使用) */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c)
}

/** 把整个查询构造成 FTS5 phrase(整体子串匹配),转义内部双引号 */
export function buildFtsMatch(q: string): string {
  return `"${q.replace(/"/g, '""')}"`
}

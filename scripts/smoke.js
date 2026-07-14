// 运行时烟雾测试:用 Electron 的 Node ABI 验证 better-sqlite3 + trigram FTS5 可用
// 跑法:ELECTRON_RUN_AS_NODE=1 npx electron scripts/smoke.js
const Database = require('better-sqlite3')

const db = new Database(':memory:')
db.exec(`CREATE VIRTUAL TABLE fts USING fts5(content, tokenize='trigram');`)
const ins = db.prepare('INSERT INTO fts(content) VALUES (?)')
ins.run('帮我做一个工具来搜索 Claude 的对话历史')
ins.run('today we build an electron app for sessions')

const cnHit = db.prepare(`SELECT content FROM fts WHERE fts MATCH ?`).all('"做一个"')
const enHit = db.prepare(`SELECT content FROM fts WHERE fts MATCH ?`).all('"electron"')
const miss = db.prepare(`SELECT content FROM fts WHERE fts MATCH ?`).all('"不存在的词"')

const ok =
  cnHit.length === 1 &&
  enHit.length === 1 &&
  miss.length === 0

console.log('中文子串命中:', cnHit.length)
console.log('英文子串命中:', enHit.length)
console.log('无关词命中:', miss.length)
console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL')
db.close()
process.exit(ok ? 0 : 1)

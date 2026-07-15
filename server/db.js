import pg from 'pg'

// TIMESTAMP WITHOUT TIME ZONE (OID 1114) 默认返回 Date 对象（假定 UTC），
// JSON.stringify 会将其转为 UTC ISO 字符串（如 2023-07-26T01:33:06.000Z），
// 前端按本地时区解析后东八区会 +8h，导致显示偏移。
// 改为直接返回 PostgreSQL 原始字符串（如 2023-07-26 09:33:06），避免隐式时区转换。
const { types } = pg
types.setTypeParser(1114, (val) => val)

// 数据库配置（环境变量 → 通用默认值，本地开发请通过环境变量传入实际值）
export const pgHost = process.env.PGHOST || 'localhost'
export const pgPort = parseInt(process.env.PGPORT || '5432', 10)
export const pgUser = process.env.PGUSER || 'dtapp'
export const pgPassword = process.env.PGPASSWORD || ''
export const pgDatabase = process.env.PGDATABASE || 'data_team_tools'
export const pgSchema = process.env.PGSCHEMA || 'public'

// JWT 配置
export const JWT_SECRET = process.env.JWT_SECRET || 'field-translator-secret-key-change-in-production'
export const JWT_EXPIRES = '7d'

// 安全警告：使用默认值时提醒
if (!process.env.JWT_SECRET) {
  console.warn('\x1b[33m[WARN] JWT_SECRET 未设置，使用默认密钥，请通过环境变量 JWT_SECRET 配置安全密钥！\x1b[0m')
}
if (!process.env.PGPASSWORD) {
  console.warn('\x1b[33m[WARN] PGPASSWORD 未设置，使用默认密码，请通过环境变量 PGPASSWORD 配置数据库密码！\x1b[0m')
}

// 连接池
export const pool = new pg.Pool({
  host: pgHost,
  port: pgPort,
  user: pgUser,
  password: pgPassword,
  database: pgDatabase,
  options: `-c search_path=${pgSchema}`,
})

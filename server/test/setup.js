/**
 * vitest globalSetup - 在所有测试之前运行
 * 返回的函数会在所有测试之后执行（作为 teardown）
 *
 * 流程：
 * 1. 设置环境变量 VITEST（让 server.js 不自动 listen）
 * 2. 覆盖 PGSCHEMA 为 test_schema_<pid>，确保测试数据隔离
 * 3. 设置 PGPORT=8232 等开发环境数据库配置
 * 4. 导入 server 模块，触发 ensureSchemaAndTables 建表
 * 5. 创建测试用户
 */
import pg from 'pg'
import bcrypt from 'bcryptjs'

const TEST_SCHEMA = `test_schema_${process.pid}`

export default async function setup() {
  // 告诉 server.js 这是测试环境（必须在 import server.js 之前设置）
  process.env.VITEST = 'true'
  process.env.PGSCHEMA = TEST_SCHEMA
  process.env.PGPORT = process.env.PGPORT || '8232'
  process.env.PGHOST = process.env.PGHOST || 'localhost'
  process.env.PGUSER = process.env.PGUSER || 'ma'
  process.env.PGPASSWORD = process.env.PGPASSWORD || 'localPG@'
  process.env.PGDATABASE = process.env.PGDATABASE || 'data_lrf_zigong'

  // 动态导入 server（此时会读环境变量，建 test schema 的表）
  const { app, ensureSchemaAndTables } = await import('../server.js')

  // 等建表完成
  await ensureSchemaAndTables()

  // 测试环境：将 admin 密码重置为固定值（生产环境是随机密码）
  const client = new pg.Client({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT, 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  const hash = bcrypt.hashSync('admin123', 10)
  await client.query(`UPDATE ${TEST_SCHEMA}.dt_users SET password_hash = $1 WHERE username = 'admin'`, [hash])
  await client.end()

  // 用 supertest 走 API 创建测试用户
  const { default: request } = await import('supertest')

  // admin 用户在 ensureSchemaAndTables 中已自动创建，先登录拿 token
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  const adminToken = adminLogin.body.token

  // 创建普通测试用户
  await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'testuser', password: 'test123', role: 'user', displayName: '测试用户' })

  // 返回 teardown 函数：清理测试 schema
  return async function teardown() {
    const client = new pg.Client({
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT, 10),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
    try {
      await client.connect()
      await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
      console.log(`[teardown] 已清理测试 schema: ${TEST_SCHEMA}`)
    } catch (err) {
      console.error('[teardown] 清理失败:', err.message)
    } finally {
      await client.end()
    }
  }
}

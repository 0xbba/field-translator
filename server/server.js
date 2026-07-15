import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool, pgSchema, pgHost, pgPort, pgDatabase } from './db.js'
import { authMiddleware, requirePerm, getUserInfo, safeError } from './middleware.js'
import { ensureSchemaAndTables } from './init.js'

// 路由模块
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import rolesRoutes from './routes/roles.js'
import translationsRoutes from './routes/translations.js'
import extractionRoutes from './routes/extraction.js'
import ledgerRoutes from './routes/ledger.js'
import tokensRoutes, { apiTokenMiddleware } from './routes/tokens.js'
import announcementsRoutes from './routes/announcements.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN || false, credentials: true }))
app.use(express.json({ limit: '10mb' }))

// 缓存控制：index.html 和 JS/CSS 资源不缓存，避免版本更新后浏览器使用旧缓存
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
  }
}))

// 对所有 /api 路由统一加认证（排除公开路由）
const publicPaths = ['/health', '/auth/login']
app.use('/api', (req, res, next) => {
  if (publicPaths.includes(req.path)) return next()
  // 先尝试 API Token 认证（Chrome 扩展等外部调用）
  apiTokenMiddleware(req, res, () => {
    // 若未通过 API Token 认证，走 JWT 认证
    if (req.user) return next()
    authMiddleware(req, res, next)
  })
})

// ============ 挂载路由模块 ============
app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/roles', rolesRoutes)
app.use('/api/translations', translationsRoutes)
app.use('/api/extraction', extractionRoutes)
app.use('/api/ledger', ledgerRoutes)
app.use('/api/auth/tokens', tokensRoutes)
app.use('/api/announcements', announcementsRoutes)

// ============ 零散路由（不值得单独文件）============

// 获取所有可用权限列表（树结构，按菜单分组，三层）
app.get('/api/permissions', async (_req, res) => {
  res.json([
    { key: 'field-group', label: '字段翻译', children: [
      { key: 'translate', label: '翻译' },
      { key: 'manage-group', label: '管理对照记录', children: [
        { key: 'manage_view', label: '查看' },
        { key: 'manage_import', label: '导入' },
        { key: 'manage_edit', label: '编辑' },
        { key: 'manage_delete', label: '删除' },
        { key: 'manage_restore', label: '恢复' },
        { key: 'manage_log', label: '日志' },
      ]},
    ]},
    { key: 'insertgen-group', label: '生成INSERT', children: [
      { key: 'insertgen', label: '生成INSERT' },
    ]},
    { key: 'multidate-group', label: '多账期SQL', children: [
      { key: 'multidate', label: '多账期SQL' },
    ]},
    { key: 'ledger-group', label: '数据需求台账', children: [
      { key: 'ledger_parse', label: '解析录入' },
      { key: 'ledger-group-manage', label: '管理台账', children: [
        { key: 'ledger_view', label: '查看' },
        { key: 'ledger_edit', label: '编辑' },
        { key: 'ledger_delete', label: '删除' },
        { key: 'ledger_restore', label: '恢复' },
        { key: 'ledger_log', label: '日志' },
      ]},
    ]},
    { key: 'system-group', label: '系统管理', children: [
      { key: 'user_manage', label: '用户管理' },
      { key: 'role_manage', label: '角色管理' },
      { key: 'announcement_manage', label: '公告管理' },
    ]},
  ])
})

// 健康检查
app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as cnt FROM dt_field_translation WHERE is_visible = true')
    res.json({ ok: true, count: Number(result.rows[0].cnt) })
  } catch (err) {
    res.json({ ok: false, error: safeError(err) })
  }
})

// 查询字段翻译变更日志（按 record_id 或全部，支持分页）
app.get('/api/logs', requirePerm('manage_log'), async (req, res) => {
  try {
    const { recordId, fieldName, page = '1', pageSize = '50' } = req.query
    const p = Math.max(1, Number(page))
    const ps = Math.min(200, Math.max(1, Number(pageSize)))
    const conditions = []
    const params = []
    let idx = 1
    if (recordId) { conditions.push(`record_id = $${idx++}`); params.push(Number(recordId)) }
    if (fieldName) { conditions.push(`field_name = $${idx++}`); params.push(String(fieldName)) }
    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM dt_field_translation_log ${where}`, params)
    const total = Number(countResult.rows[0].cnt)
    const result = await pool.query(
      `SELECT id, operation, record_id, field_name, old_value, new_value, user_name, operation_date FROM dt_field_translation_log ${where} ORDER BY operation_date DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, ps, (p - 1) * ps]
    )
    res.json({
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.max(1, Math.ceil(total / ps)),
      rows: result.rows.map(r => ({
        id: r.id,
        operation: r.operation,
        recordId: r.record_id,
        fieldName: r.field_name,
        oldValue: r.old_value,
        newValue: r.new_value,
        userName: r.user_name || '',
        operationDate: r.operation_date,
      })),
    })
  } catch (err) {
    console.error('[GET /api/logs]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// SPA fallback + 404 for unknown API routes
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' })
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
  }
})

// 非 vitest 环境下才启动监听
if (!process.env.VITEST) {
  const PORT = parseInt(process.env.PORT || '3456', 10)
  ensureSchemaAndTables().then(() => {
    app.listen(PORT, () => {
      console.log('')
      console.log('========================================')
      console.log('  字段翻译工具 - API 服务已启动')
      console.log('========================================')
      console.log(`  访问地址: http://localhost:${PORT}`)
      console.log(`  数据库: ${pgHost}:${pgPort}/${pgDatabase} (${pgSchema})`)
      console.log('========================================')
    })
  }).catch(err => {
    console.error('[init] 启动失败:', err.message)
    process.exit(1)
  })
}

// 测试时导出 app 和初始化函数，供 supertest 使用
export { app, pool, pgSchema, ensureSchemaAndTables }

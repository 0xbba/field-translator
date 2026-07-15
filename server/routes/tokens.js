import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { authMiddleware } from '../middleware.js'

const router = Router()

// 所有路由需要登录
router.use(authMiddleware)

// 生成新 Token
router.post('/', async (req, res) => {
  try {
    const { name, expires_in } = req.body
    const tokenName = (name || 'default').trim().slice(0, 50)
    // 生成随机 token: dtt_ + 32字节hex
    const rawToken = 'dtt_' + crypto.randomBytes(32).toString('hex')
    const tokenHash = await bcrypt.hash(rawToken, 10)
    // 计算过期时间
    let expiresAt = null
    if (expires_in && expires_in !== 'never') {
      const days = Number(expires_in)
      if (days > 0) {
        const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        const pad = (n) => String(n).padStart(2, '0')
        expiresAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      }
    }
    const result = await pool.query(
      'INSERT INTO dt_api_tokens (user_id, token_hash, name, expires_at) VALUES ($1, $2, $3, $4) RETURNING id, name, expires_at, create_date',
      [req.user.id, tokenHash, tokenName, expiresAt]
    )
    // 只在创建时返回明文 token，之后无法再获取
    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      token: rawToken,
      expiresAt: result.rows[0].expires_at,
      createDate: result.rows[0].create_date,
      message: '请立即复制保存，此 Token 不会再次显示',
    })
  } catch (err) {
    console.error('[POST /api/auth/tokens]', err)
    res.status(500).json({ error: err.message })
  }
})

// 列出当前用户的所有 Token（不返回 token 明文）
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, last_used, expires_at, create_date FROM dt_api_tokens WHERE user_id = $1 ORDER BY create_date DESC',
      [req.user.id]
    )
    res.json(result.rows.map(r => ({
      id: r.id,
      name: r.name,
      lastUsed: r.last_used,
      expiresAt: r.expires_at,
      createDate: r.create_date,
      // 过期状态计算
      expired: r.expires_at ? new Date(r.expires_at) < new Date() : false,
    })))
  } catch (err) {
    console.error('[GET /api/auth/tokens]', err)
    res.status(500).json({ error: err.message })
  }
})

// 吊销（删除）Token
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      'DELETE FROM dt_api_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Token不存在' })
    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/auth/tokens/:id]', err)
    res.status(500).json({ error: err.message })
  }
})

// 验证 API Token 的中间件（供外部调用，如 Chrome 扩展）
export async function apiTokenMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return next()
  const rawToken = authHeader.slice(7)
  if (!rawToken.startsWith('dtt_')) {
    // 不是 API Token，走 JWT 逻辑
    return next()
  }
  try {
    // 只查未过期的 token（expires_at 为空或大于当前时间）
    const result = await pool.query(
      "SELECT id, user_id, token_hash, name, expires_at FROM dt_api_tokens WHERE expires_at IS NULL OR expires_at > NOW()"
    )
    let matched = null
    for (const row of result.rows) {
      const isMatch = await bcrypt.compare(rawToken, row.token_hash)
      if (isMatch) {
        matched = row
        break
      }
    }
    if (!matched) return res.status(401).json({ error: '无效的API Token' })
    // 更新最后使用时间（确保写入完成再继续）
    try {
      await pool.query('UPDATE dt_api_tokens SET last_used = NOW() WHERE id = $1', [matched.id])
    } catch (err) {
      console.error('[apiTokenMiddleware] last_used update failed:', err.message)
    }
    // 获取用户信息
    const userResult = await pool.query('SELECT id, username, role, display_name, is_active FROM dt_users WHERE id = $1', [matched.user_id])
    const user = userResult.rows[0]
    if (!user || !user.is_active) return res.status(401).json({ error: '用户不存在或已禁用' })
    const roleResult = await pool.query('SELECT role_name, permissions FROM dt_roles WHERE role_key = $1', [user.role])
    const roleInfo = roleResult.rows[0] || { role_name: user.role, permissions: [] }
    req.user = { id: user.id, username: user.username, displayName: user.display_name || user.username, role: user.role, roleName: roleInfo.role_name, permissions: roleInfo.permissions }
    next()
  } catch (err) {
    console.error('[apiTokenMiddleware]', err)
    res.status(401).json({ error: 'Token验证失败' })
  }
}

export default router

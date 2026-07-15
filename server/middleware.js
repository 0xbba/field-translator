import jwt from 'jsonwebtoken'
import { pool, JWT_SECRET } from './db.js'

// ============ 工具函数 ============

export function getUserInfo(req) {
  if (!req?.user) return {}
  return { userId: req.user.id, userName: req.user.displayName || req.user.username }
}

// 500 错误脱敏：不把 err.message（可能含 SQL 语句等内部信息）返回给客户端
export function safeError(_err) {
  return '服务器内部错误'
}

// ============ 认证中间件 ============

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' })
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'token无效或已过期' })
  }
}

// 权限检查中间件工厂
export function requirePerm(perm) {
  return async (req, res, next) => {
    try {
      const result = await pool.query('SELECT r.permissions FROM dt_users u JOIN dt_roles r ON u.role = r.role_key WHERE u.id = $1 AND u.is_active = true', [req.user.id])
      const perms = result.rows[0]?.permissions || []
      if (!perms.includes(perm)) return res.status(403).json({ error: '权限不足' })
      next()
    } catch (err) {
      console.error('[requirePerm]', err.message)
      return res.status(500).json({ error: '权限检查失败' })
    }
  }
}

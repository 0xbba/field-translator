import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { requirePerm, safeError } from '../middleware.js'

const router = Router()

// 获取用户列表
router.get('/', requirePerm('user_manage'), async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, display_name, is_active, create_date, last_modified FROM dt_users ORDER BY id')
    res.json(result.rows.map(r => ({ id: r.id, username: r.username, role: r.role, displayName: r.display_name || '', isActive: r.is_active, createDate: r.create_date, lastModified: r.last_modified })))
  } catch (err) {
    console.error('[GET /api/users]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 获取在用用户的 displayName 列表
router.get('/display-names', async (_req, res) => {
  try {
    const result = await pool.query("SELECT display_name FROM dt_users WHERE is_active = true AND display_name IS NOT NULL AND display_name != '' ORDER BY display_name")
    res.json(result.rows.map(r => r.display_name))
  } catch (err) {
    console.error('[GET /api/users/display-names]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 创建用户
router.post('/', requirePerm('user_manage'), async (req, res) => {
  try {
    const { username, password, role, displayName } = req.body
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' })
    // 动态获取所有角色 key，允许分配自定义角色
    const validRoles = await pool.query('SELECT role_key FROM dt_roles')
    const roleKeys = validRoles.rows.map(r => r.role_key)
    if (role && !roleKeys.includes(role)) return res.status(400).json({ error: `角色只能是 ${roleKeys.join(' 或 ')}` })
    const hash = bcrypt.hashSync(password, 10)
    const result = await pool.query(
      'INSERT INTO dt_users (username, password_hash, role, display_name) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, hash, role || 'user', displayName || null]
    )
    res.json({ id: result.rows[0].id })
  } catch (err) {
    console.error('[POST /api/users]', err)
    if (err.code === '23505') return res.status(400).json({ error: '用户名已存在' })
    res.status(500).json({ error: safeError(err) })
  }
})

// 更新用户
router.put('/:id', requirePerm('user_manage'), async (req, res) => {
  try {
    const { id } = req.params
    const { role, displayName, isActive, password } = req.body
    const sets = []
    const vals = []
    let idx = 1
    if (role !== undefined) { sets.push(`role = $${idx++}`); vals.push(role) }
    if (displayName !== undefined) { sets.push(`display_name = $${idx++}`); vals.push(displayName) }
    if (isActive !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(isActive) }
    if (password) { sets.push(`password_hash = $${idx++}`); vals.push(bcrypt.hashSync(password, 10)) }
    if (sets.length === 0) return res.json({ success: true, unchanged: true })
    sets.push(`last_modified = NOW()`)
    vals.push(id)
    await pool.query(`UPDATE dt_users SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/users/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 删除用户
router.delete('/:id', requirePerm('user_manage'), async (req, res) => {
  try {
    const { id } = req.params
    if (Number(id) === req.user.id) return res.status(400).json({ error: '不能删除自己' })
    await pool.query('UPDATE dt_users SET is_active = false, last_modified = NOW() WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/users/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

export default router

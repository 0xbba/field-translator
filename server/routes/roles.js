import { Router } from 'express'
import { pool } from '../db.js'
import { requirePerm, safeError } from '../middleware.js'

const router = Router()

// 获取角色列表
router.get('/', requirePerm('role_manage'), async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, role_key, role_name, permissions, is_builtin, create_date, last_modified FROM dt_roles ORDER BY id')
    res.json(result.rows)
  } catch (err) {
    console.error('[GET /api/roles]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 创建角色
router.post('/', requirePerm('role_manage'), async (req, res) => {
  try {
    const { roleKey, roleName, permissions } = req.body
    if (!roleKey || !roleName) return res.status(400).json({ error: '角色标识和名称必填' })
    const result = await pool.query(
      'INSERT INTO dt_roles (role_key, role_name, permissions) VALUES ($1, $2, $3) RETURNING id',
      [roleKey, roleName, JSON.stringify(permissions || [])]
    )
    res.json({ id: result.rows[0].id })
  } catch (err) {
    console.error('[POST /api/roles]', err)
    if (err.code === '23505') return res.status(400).json({ error: '角色标识已存在' })
    res.status(500).json({ error: safeError(err) })
  }
})

// 更新角色
router.put('/:id', requirePerm('role_manage'), async (req, res) => {
  try {
    const { id } = req.params
    const { roleName, permissions } = req.body
    const sets = []
    const vals = []
    let idx = 1
    if (roleName !== undefined) { sets.push(`role_name = $${idx++}`); vals.push(roleName) }
    if (permissions !== undefined) { sets.push(`permissions = $${idx++}`); vals.push(JSON.stringify(permissions)) }
    if (sets.length === 0) return res.json({ success: true, unchanged: true })
    sets.push(`last_modified = NOW()`)
    vals.push(id)
    await pool.query(`UPDATE dt_roles SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/roles/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 删除角色
router.delete('/:id', requirePerm('role_manage'), async (req, res) => {
  try {
    const { id } = req.params
    const role = await pool.query('SELECT role_key, is_builtin FROM dt_roles WHERE id = $1', [id])
    if (!role.rows[0]) return res.status(404).json({ error: '角色不存在' })
    if (role.rows[0].is_builtin) return res.status(400).json({ error: '内置角色不能删除' })
    const userCount = await pool.query('SELECT COUNT(*) as cnt FROM dt_users WHERE role = $1', [role.rows[0].role_key])
    if (Number(userCount.rows[0].cnt) > 0) return res.status(400).json({ error: `有 ${Number(userCount.rows[0].cnt)} 个用户使用此角色，无法删除` })
    await pool.query('DELETE FROM dt_roles WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/roles/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

export default router

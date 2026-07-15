import { Router } from 'express'
import { pool } from '../db.js'
import { requirePerm, getUserInfo, safeError } from '../middleware.js'
import { writeLog } from '../utils/log.js'

const router = Router()

const LOG_TABLE = 'dt_announcements_log'

// 获取可见公告列表（所有登录用户可访问，用于轮播展示）
// 过滤：is_visible=true AND is_active=true AND (expires_at IS NULL OR expires_at > NOW())
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, content, create_date FROM dt_announcements
       WHERE is_visible = true AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY create_date DESC`
    )
    res.json(result.rows.map(r => ({
      id: r.id,
      content: r.content,
      createDate: r.create_date,
    })))
  } catch (err) {
    console.error('[GET /api/announcements]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 获取所有公告（含已删除，管理页面用）
router.get('/all', requirePerm('announcement_manage'), async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query
    const p = Math.max(1, Number(page))
    const ps = Math.min(100, Math.max(1, Number(pageSize)))
    const offset = (p - 1) * ps
    const countResult = await pool.query('SELECT COUNT(*) as cnt FROM dt_announcements')
    const total = Number(countResult.rows[0].cnt)
    const result = await pool.query(
      `SELECT id, content, is_active, expires_at, is_visible, user_name, create_date, last_modified
       FROM dt_announcements ORDER BY create_date DESC LIMIT $1 OFFSET $2`,
      [ps, offset]
    )
    res.json({
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.max(1, Math.ceil(total / ps)),
      rows: result.rows.map(r => ({
        id: r.id,
        content: r.content,
        isActive: r.is_active,
        expiresAt: r.expires_at,
        isVisible: r.is_visible,
        userName: r.user_name || '',
        createDate: r.create_date,
        lastModified: r.last_modified,
      })),
    })
  } catch (err) {
    console.error('[GET /api/announcements/all]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 新增公告
router.post('/', requirePerm('announcement_manage'), async (req, res) => {
  try {
    const { content, is_active, expires_at } = req.body
    if (!content || !content.trim()) return res.status(400).json({ error: '公告内容不能为空' })
    const userInfo = getUserInfo(req)
    const result = await pool.query(
      `INSERT INTO dt_announcements (content, is_active, expires_at, is_visible, user_id, user_name, create_date, last_modified)
       VALUES ($1, $2, $3, true, $4, $5, NOW(), NOW()) RETURNING id`,
      [
        content.trim(),
        is_active !== undefined ? is_active : true,
        expires_at || null,
        userInfo.userId,
        userInfo.userName,
      ]
    )
    await writeLog(LOG_TABLE, { operation: 'INSERT', recordId: result.rows[0].id, newValue: null, ...userInfo })
    res.json({ id: result.rows[0].id })
  } catch (err) {
    console.error('[POST /api/announcements]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 更新公告
router.put('/:id', requirePerm('announcement_manage'), async (req, res) => {
  try {
    const { id } = req.params
    const { content, is_active, expires_at } = req.body
    const old = await pool.query('SELECT content, is_active, expires_at FROM dt_announcements WHERE id = $1', [id])
    const oldRow = old.rows[0]
    if (!oldRow) return res.status(404).json({ error: '公告不存在' })
    const userInfo = getUserInfo(req)
    const updates = []
    const params = []
    let idx = 1
    if (content !== undefined) { updates.push(`content = $${idx++}`); params.push(content.trim()) }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(is_active) }
    if (expires_at !== undefined) { updates.push(`expires_at = $${idx++}`); params.push(expires_at || null) }
    if (updates.length > 0) {
      updates.push(`last_modified = NOW()`)
      params.push(id)
      await pool.query(`UPDATE dt_announcements SET ${updates.join(', ')} WHERE id = $${idx}`, params)
    }
    // 日志：记录内容变更
    if (content !== undefined) {
      const oldVal = oldRow.content || ''
      const newVal = content.trim()
      if (oldVal !== newVal) {
        await writeLog(LOG_TABLE, { operation: 'UPDATE', recordId: Number(id), fieldName: '内容', oldValue: oldVal, newValue: newVal, ...userInfo })
      }
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/announcements/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 删除公告（软删除）
router.delete('/:id', requirePerm('announcement_manage'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE dt_announcements SET is_visible = false, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, { operation: 'DELETE', recordId: Number(id), newValue: null, ...getUserInfo(req) })
    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/announcements/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 恢复公告
router.put('/:id/restore', requirePerm('announcement_manage'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE dt_announcements SET is_visible = true, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, { operation: 'RESTORE', recordId: Number(id), newValue: null, ...getUserInfo(req) })
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/announcements/:id/restore]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

export default router

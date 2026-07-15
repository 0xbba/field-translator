import { Router } from 'express'
import { pool } from '../db.js'
import { requirePerm, getUserInfo, safeError } from '../middleware.js'
import { writeLog } from '../utils/log.js'

const router = Router()

const LOG_TABLE = 'dt_field_translation_log'

// 查询全部（仅 is_visible=true，可搜索）
router.get('/', async (req, res) => {
  try {
    const { search } = req.query
    let sql = 'SELECT id, field_name, field_translation, create_date, last_modified FROM dt_field_translation WHERE is_visible = true'
    const params = []
    if (search) {
      sql += ' AND (field_name ILIKE $1 OR field_translation ILIKE $1)'
      params.push(`%${search}%`)
    }
    sql += ' ORDER BY id'
    const result = await pool.query(sql, params)
    res.json(result.rows.map(r => ({
      id: r.id,
      original: r.field_name,
      chinese: r.field_translation,
      createDate: r.create_date,
      lastModified: r.last_modified,
    })))
  } catch (err) {
    console.error('[GET /api/translations]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 查询已删除记录
router.get('/deleted', requirePerm('manage_view'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, field_name, field_translation, create_date, last_modified FROM dt_field_translation WHERE is_visible = false ORDER BY last_modified DESC')
    res.json(result.rows.map(r => ({
      id: r.id,
      original: r.field_name,
      chinese: r.field_translation,
      createDate: r.create_date,
      lastModified: r.last_modified,
    })))
  } catch (err) {
    console.error('[GET /api/translations/deleted]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 恢复已删除记录
router.put('/:id/restore', requirePerm('manage_restore'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE dt_field_translation SET is_visible = true, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, {
      operation: 'RESTORE',
      recordId: Number(id),
      newValue: null,
      ...getUserInfo(req)
    })
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/translations/:id/restore]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 新增
router.post('/', async (req, res) => {
  try {
    const { original, chinese } = req.body
    if (!original || !chinese) return res.status(400).json({ error: 'original and chinese are required' })
    const { userId, userName } = getUserInfo(req)
    const result = await pool.query(
      'INSERT INTO dt_field_translation (field_name, field_translation, is_visible, user_id, user_name, create_date, last_modified) VALUES ($1, $2, true, $3, $4, NOW(), NOW()) RETURNING id',
      [original, chinese, userId || null, userName || null]
    )
    const id = result.rows[0].id
    await writeLog(LOG_TABLE, {
      operation: 'INSERT',
      recordId: id,
      fieldName: original,
      newValue: chinese,
      userId, userName
    })
    res.json({ id, original, chinese })
  } catch (err) {
    console.error('[POST /api/translations]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 更新（字段名不可修改，仅更新翻译）
router.put('/:id', requirePerm('manage_edit'), async (req, res) => {
  try {
    const { id } = req.params
    const { chinese } = req.body
    if (!chinese) return res.status(400).json({ error: 'chinese is required' })
    const old = await pool.query('SELECT field_name, field_translation FROM dt_field_translation WHERE id = $1', [id])
    const oldRow = old.rows[0] || null
    if (!oldRow) return res.status(404).json({ error: 'record not found' })
    if (chinese === oldRow.field_translation) return res.json({ success: true, unchanged: true })
    const { userId, userName } = getUserInfo(req)
    await pool.query(
      'UPDATE dt_field_translation SET field_translation = $1, last_modified = NOW(), user_id = $2, user_name = $3 WHERE id = $4',
      [chinese, userId || null, userName || null, id]
    )
    await writeLog(LOG_TABLE, {
      operation: 'UPDATE',
      recordId: Number(id),
      fieldName: oldRow.field_name,
      oldValue: oldRow.field_translation,
      newValue: chinese,
      ...getUserInfo(req)
    })
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/translations/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 删除（软删除）
router.delete('/:id', requirePerm('manage_delete'), async (req, res) => {
  try {
    const { id } = req.params
    const old = await pool.query('SELECT field_name, field_translation FROM dt_field_translation WHERE id = $1', [id])
    const oldRow = old.rows[0] || null
    await pool.query('UPDATE dt_field_translation SET is_visible = false, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, {
      operation: 'DELETE',
      recordId: Number(id),
      newValue: null,
      ...getUserInfo(req)
    })
    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/translations/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 按字段名批量查询翻译（用于实时匹配未命中的字段）
router.post('/lookup', async (req, res) => {
  try {
    const { fields } = req.body
    if (!Array.isArray(fields) || fields.length === 0) return res.json([])
    // 用 ANY 批量查询，避免 N+1
    const result = await pool.query(
      'SELECT id, field_name, field_translation FROM dt_field_translation WHERE field_name = ANY($1) AND is_visible = true',
      [fields]
    )
    res.json(result.rows.map(r => ({
      id: r.id,
      original: r.field_name,
      chinese: r.field_translation,
    })))
  } catch (err) {
    console.error('[POST /api/translations/lookup]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 批量导入
router.post('/import', requirePerm('manage_import'), async (req, res) => {
  const client = await pool.connect()
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' })

    await client.query('BEGIN')
    let inserted = 0, skipped = 0
    const { userId: _uid, userName: _uname } = getUserInfo(req)
    for (const item of items) {
      if (!item.original || !item.chinese) continue
      const existing = await client.query(
        'SELECT id, field_name, field_translation FROM dt_field_translation WHERE field_name = $1 AND is_visible = true',
        [item.original]
      )
      if (existing.rows.length > 0) {
        skipped++
      } else {
        const insResult = await client.query(
          'INSERT INTO dt_field_translation (field_name, field_translation, is_visible, user_id, user_name, create_date, last_modified) VALUES ($1, $2, true, $3, $4, NOW(), NOW()) RETURNING id',
          [item.original, item.chinese, _uid || null, _uname || null]
        )
        await writeLog(LOG_TABLE, { operation: 'INSERT', recordId: insResult.rows[0].id, fieldName: item.original, newValue: item.chinese, userId: _uid || null, userName: _uname || null }, client)
        inserted++
      }
    }
    await client.query('COMMIT')
    res.json({ success: true, inserted, skipped, total: items.length })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/translations/import]', err)
    res.status(500).json({ error: safeError(err) })
  } finally {
    client.release()
  }
})

export default router

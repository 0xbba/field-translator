import { Router } from 'express'
import { pool } from '../db.js'
import { requirePerm, getUserInfo } from '../middleware.js'
import { writeLog } from '../utils/log.js'

const router = Router()

const LOG_TABLE = 'dt_data_extraction_records_log'

// 查询某单号的提取记录列表（含已删除）
router.get('/:requestNo', async (req, res) => {
  try {
    const { requestNo } = req.params
    const result = await pool.query(
      'SELECT id, request_no, record_count, extractor, supervisor, remark, is_visible, create_date FROM dt_data_extraction_records WHERE request_no = $1 ORDER BY create_date DESC',
      [requestNo]
    )
    res.json(result.rows.map(r => ({
      id: r.id,
      requestNo: r.request_no || '',
      recordCount: r.record_count ?? 0,
      extractor: r.extractor || '',
      supervisor: r.supervisor || '',
      remark: r.remark || '',
      createDate: r.create_date || '',
      isVisible: r.is_visible !== false,
    })))
  } catch (err) {
    console.error('[GET /api/extraction/:requestNo]', err)
    res.status(500).json({ error: err.message })
  }
})

// 新增提取记录
router.post('/', requirePerm('ledger_parse'), async (req, res) => {
  try {
    const { request_no, record_count, extractor, supervisor, remark } = req.body
    if (!request_no) return res.status(400).json({ error: 'request_no is required' })
    const result = await pool.query(
      `INSERT INTO dt_data_extraction_records (request_no, record_count, extractor, supervisor, remark, create_date, last_modified)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
      [request_no, record_count || null, extractor || null, supervisor || null, remark || null]
    )
    await writeLog(LOG_TABLE, { operation: 'INSERT', recordId: result.rows[0].id, newValue: null, ...getUserInfo(req) })
    res.json({ id: result.rows[0].id })
  } catch (err) {
    console.error('[POST /api/extraction]', err)
    res.status(500).json({ error: err.message })
  }
})

// 更新提取记录
router.put('/:id', requirePerm('ledger_edit'), async (req, res) => {
  try {
    const { id } = req.params
    const { record_count, extractor, supervisor, remark } = req.body
    const old = await pool.query('SELECT record_count, extractor, supervisor, remark FROM dt_data_extraction_records WHERE id = $1 AND is_visible = true', [id])
    const oldRow = old.rows[0]
    if (!oldRow) return res.status(404).json({ error: '记录不存在' })
    await pool.query(
      'UPDATE dt_data_extraction_records SET record_count = $1, extractor = $2, supervisor = $3, remark = $4, last_modified = NOW() WHERE id = $5 AND is_visible = true',
      [record_count ?? null, extractor ?? null, supervisor ?? null, remark ?? null, id]
    )
    const labelMap = { record_count: '数据条数', extractor: '取数人', supervisor: '监督人', remark: '备注' }
    for (const [k, label] of Object.entries(labelMap)) {
      const oldVal = String(oldRow[k] ?? '')
      const newVal = String(req.body[k] ?? '')
      if (oldVal !== newVal) {
        await writeLog(LOG_TABLE, { operation: 'UPDATE', recordId: Number(id), fieldName: label, oldValue: oldVal, newValue: newVal, ...getUserInfo(req) })
      }
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/extraction/:id]', err)
    res.status(500).json({ error: err.message })
  }
})

// 删除提取记录（软删除）
router.delete('/:id', requirePerm('ledger_delete'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE dt_data_extraction_records SET is_visible = false, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, { operation: 'DELETE', recordId: Number(id), newValue: null, ...getUserInfo(req) })
    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/extraction/:id]', err)
    res.status(500).json({ error: err.message })
  }
})

// 恢复提取记录
router.put('/:id/restore', requirePerm('ledger_restore'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE dt_data_extraction_records SET is_visible = true, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, { operation: 'RESTORE', recordId: Number(id), newValue: null, ...getUserInfo(req) })
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/extraction/:id/restore]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router

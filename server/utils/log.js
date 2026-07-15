import { pool } from '../db.js'

/**
 * 通用操作日志写入函数
 * @param {string} tableName - 日志表名（如 dt_field_translation_log）
 * @param {object} params - 日志参数
 */
export async function writeLog(tableName, { operation, recordId, fieldName, oldValue, newValue, userId, userName }) {
  try {
    await pool.query(
      `INSERT INTO ${tableName} (operation, record_id, field_name, old_value, new_value, user_id, user_name, operation_date) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [operation, recordId, fieldName ?? null, oldValue ?? null, newValue ?? null, userId ?? null, userName ?? null]
    )
  } catch (err) {
    console.error(`[writeLog:${tableName}]`, err.message)
  }
}

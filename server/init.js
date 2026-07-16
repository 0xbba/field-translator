import bcrypt from 'bcryptjs'
import { pool, pgSchema } from './db.js'

// ============ 启动时自动建表 ============
export async function ensureSchemaAndTables() {
  const client = await pool.connect()
  try {
    // 确保 schema 存在（先查，避免无 CREATE 权限时报错）
    const schemaExists = await client.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [pgSchema]
    )
    if (schemaExists.rows.length === 0) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${pgSchema}`)
      console.log(`[init] Schema "${pgSchema}" 已创建`)
    } else {
      console.log(`[init] Schema "${pgSchema}" 已就绪`)
    }

    const tables = [
      {
        name: 'dt_field_translation',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_field_translation (
          id SERIAL PRIMARY KEY,
          field_name TEXT NOT NULL,
          field_translation TEXT,
          user_id INTEGER,
          user_name TEXT,
          is_visible BOOLEAN NOT NULL DEFAULT true,
          create_date TIMESTAMP NOT NULL DEFAULT NOW(),
          last_modified TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE INDEX IF NOT EXISTS idx_ft_field_name ON ${pgSchema}.dt_field_translation (field_name)`,
      },
      {
        name: 'dt_field_translation_log',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_field_translation_log (
          id SERIAL PRIMARY KEY,
          operation TEXT NOT NULL,
          record_id INTEGER,
          field_name TEXT,
          old_value TEXT,
          new_value TEXT,
          user_id INTEGER,
          user_name TEXT,
          operation_date TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE INDEX IF NOT EXISTS idx_ftl_record_id ON ${pgSchema}.dt_field_translation_log (record_id)`,
      },
      {
        name: 'dt_data_request_ledger',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_data_request_ledger (
          id SERIAL PRIMARY KEY,
          request_no TEXT,
          request_time TEXT,
          applicant TEXT,
          applicant_phone TEXT,
          applicant_dept TEXT,
          request_title TEXT,
          request_reason TEXT,
          request_data_content TEXT,
          processor TEXT,
          finish_time TIMESTAMP DEFAULT NOW(),
          is_visible BOOLEAN NOT NULL DEFAULT true,
          create_date TIMESTAMP NOT NULL DEFAULT NOW(),
          last_modified TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_drl_request_no ON ${pgSchema}.dt_data_request_ledger (request_no) WHERE is_visible = true`,
      },
      {
        name: 'dt_data_request_ledger_log',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_data_request_ledger_log (
          id SERIAL PRIMARY KEY,
          operation TEXT NOT NULL,
          record_id INTEGER,
          field_name TEXT,
          old_value TEXT,
          new_value TEXT,
          user_id INTEGER,
          user_name TEXT,
          operation_date TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE INDEX IF NOT EXISTS idx_drll_record_id ON ${pgSchema}.dt_data_request_ledger_log (record_id)`,
      },
      {
        name: 'dt_data_extraction_records',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_data_extraction_records (
          id SERIAL PRIMARY KEY,
          request_no TEXT NOT NULL,
          record_count INTEGER,
          extractor TEXT,
          supervisor TEXT,
          remark TEXT,
          is_visible BOOLEAN NOT NULL DEFAULT true,
          create_date TIMESTAMP NOT NULL DEFAULT NOW(),
          last_modified TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE INDEX IF NOT EXISTS idx_der_request_no ON ${pgSchema}.dt_data_extraction_records (request_no)`,
      },
      {
        name: 'dt_data_extraction_records_log',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_data_extraction_records_log (
          id SERIAL PRIMARY KEY,
          operation TEXT NOT NULL,
          record_id INTEGER,
          field_name TEXT,
          old_value TEXT,
          new_value TEXT,
          user_id INTEGER,
          user_name TEXT,
          operation_date TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE INDEX IF NOT EXISTS idx_derl_record_id ON ${pgSchema}.dt_data_extraction_records_log (record_id)`,
      },
      {
        name: 'dt_users',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          display_name TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          create_date TIMESTAMP NOT NULL DEFAULT NOW(),
          last_modified TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON ${pgSchema}.dt_users (username)`,
      },
      {
        name: 'dt_roles',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_roles (
          id SERIAL PRIMARY KEY,
          role_key TEXT NOT NULL UNIQUE,
          role_name TEXT NOT NULL,
          permissions JSONB NOT NULL DEFAULT '[]',
          is_builtin BOOLEAN NOT NULL DEFAULT false,
          create_date TIMESTAMP NOT NULL DEFAULT NOW(),
          last_modified TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_key ON ${pgSchema}.dt_roles (role_key)`,
      },
      {
        name: 'dt_api_tokens',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_api_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES ${pgSchema}.dt_users(id),
          token_hash TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL DEFAULT 'default',
          last_used TIMESTAMP,
          expires_at TIMESTAMP,
          create_date TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON ${pgSchema}.dt_api_tokens (user_id)`,
      },
      {
        name: 'dt_announcements',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_announcements (
          id SERIAL PRIMARY KEY,
          content TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          expires_at TIMESTAMP,
          is_visible BOOLEAN NOT NULL DEFAULT true,
          user_id INTEGER,
          user_name TEXT,
          create_date TIMESTAMP NOT NULL DEFAULT NOW(),
          last_modified TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: null,
      },
      {
        name: 'dt_announcements_log',
        ddl: `CREATE TABLE IF NOT EXISTS ${pgSchema}.dt_announcements_log (
          id SERIAL PRIMARY KEY,
          operation TEXT NOT NULL,
          record_id INTEGER,
          field_name TEXT,
          old_value TEXT,
          new_value TEXT,
          user_id INTEGER,
          user_name TEXT,
          operation_date TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        index: `CREATE INDEX IF NOT EXISTS idx_ann_log_record_id ON ${pgSchema}.dt_announcements_log (record_id)`,
      },
    ]

    for (const t of tables) {
      await client.query(t.ddl)
      if (t.index) await client.query(t.index)
      console.log(`[init] 表 "${pgSchema}.${t.name}" 已就绪`)
    }

    // 迁移：为已存在的 dt_data_extraction_records 表补充 remark 列
    const remarkCol = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'dt_data_extraction_records' AND column_name = 'remark'`,
      [pgSchema]
    )
    if (remarkCol.rows.length === 0) {
      await client.query(`ALTER TABLE ${pgSchema}.dt_data_extraction_records ADD COLUMN remark TEXT`)
      console.log('[init] 已为 dt_data_extraction_records 添加 remark 列')
    }

    // 迁移：为已存在的 dt_api_tokens 表补充 expires_at 列
    const expiresAtCol = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'dt_api_tokens' AND column_name = 'expires_at'`,
      [pgSchema]
    )
    if (expiresAtCol.rows.length === 0) {
      await client.query(`ALTER TABLE ${pgSchema}.dt_api_tokens ADD COLUMN expires_at TIMESTAMP`)
      console.log('[init] 已为 dt_api_tokens 添加 expires_at 列')
    }

    // 迁移：为已存在的 dt_announcements 表补充 is_active 和 expires_at 列
    const annIsActiveCol = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'dt_announcements' AND column_name = 'is_active'`,
      [pgSchema]
    )
    if (annIsActiveCol.rows.length === 0) {
      await client.query(`ALTER TABLE ${pgSchema}.dt_announcements ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true`)
      console.log('[init] 已为 dt_announcements 添加 is_active 列')
    }
    const annExpiresAtCol = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'dt_announcements' AND column_name = 'expires_at'`,
      [pgSchema]
    )
    if (annExpiresAtCol.rows.length === 0) {
      await client.query(`ALTER TABLE ${pgSchema}.dt_announcements ADD COLUMN expires_at TIMESTAMP`)
      console.log('[init] 已为 dt_announcements 添加 expires_at 列')
    }

    // 创建默认角色（仅在 roles 表为空时）
    const roleCount = await client.query('SELECT COUNT(*) as cnt FROM dt_roles')
    if (Number(roleCount.rows[0].cnt) === 0) {
      const allPerms = JSON.stringify(['translate','manage_view','manage_import','manage_edit','manage_delete','manage_restore','manage_log','insertgen','multidate','ledger_parse','ledger_view','ledger_edit','ledger_delete','ledger_restore','ledger_log','user_manage','role_manage','announcement_manage'])
      const userPerms = JSON.stringify(['translate','manage_view','manage_import','manage_edit','manage_log','insertgen','multidate','ledger_parse','ledger_view','ledger_edit','ledger_log'])
      await client.query(
        'INSERT INTO dt_roles (role_key, role_name, permissions, is_builtin) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
        ['admin', '管理员', allPerms, true, 'user', '普通用户', userPerms, true]
      )
      console.log('[init] 默认角色已创建 (admin, user)')
    }

    // 创建默认管理员（仅在 users 表为空时）
    const userCount = await client.query('SELECT COUNT(*) as cnt FROM dt_users')
    if (Number(userCount.rows[0].cnt) === 0) {
      // 生成随机密码（大小写字母+数字，16位）
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
      let randomPwd = ''
      for (let i = 0; i < 16; i++) randomPwd += chars[Math.floor(Math.random() * chars.length)]
      const hash = bcrypt.hashSync(randomPwd, 10)
      await client.query(
        'INSERT INTO dt_users (username, password_hash, role, display_name) VALUES ($1, $2, $3, $4)',
        ['admin', hash, 'admin', '管理员']
      )
      console.log('')
      console.log('========================================================')
      console.log('  [安全提示] 首次部署已创建管理员账号')
      console.log(`  用户名: admin`)
      console.log(`  密码:   ${randomPwd}`)
      console.log('  ⚠ 此密码仅展示一次，请立即登录后修改密码！')
      console.log('  ⚠ 重启服务不会再次显示，请妥善保管。')
      console.log('========================================================')
      console.log('')
    }

    // 权限key迁移：将旧权限key自动转换为新的细粒度key，清理无效的父节点key
    const ALL_VALID_LEAF_KEYS = new Set([
      'translate', 'manage_view', 'manage_import', 'manage_edit', 'manage_delete', 'manage_restore', 'manage_log',
      'insertgen', 'multidate', 'ledger_parse',
      'ledger_view', 'ledger_edit', 'ledger_delete', 'ledger_restore', 'ledger_log',
      'user_manage', 'role_manage',
      'announcement_manage',
    ])
    const oldPermMap = {
      'manage': ['manage_view', 'manage_import', 'manage_edit', 'manage_delete', 'manage_restore', 'manage_log'],
      'ledger_manage': ['ledger_view', 'ledger_edit', 'ledger_delete', 'ledger_restore', 'ledger_log'],
    }
    const rolesToMigrate = await client.query('SELECT id, permissions FROM dt_roles')
    for (const role of rolesToMigrate.rows) {
      const perms = role.permissions || []
      let changed = false
      const newPerms = []
      for (const p of perms) {
        if (oldPermMap[p]) {
          newPerms.push(...oldPermMap[p])
          changed = true
        } else if (p === 'delete_record') {
          // delete_record 拆分到两个菜单下
          if (!newPerms.includes('manage_delete')) newPerms.push('manage_delete', 'manage_restore')
          if (!newPerms.includes('ledger_delete')) newPerms.push('ledger_delete', 'ledger_restore')
          changed = true
        } else if (ALL_VALID_LEAF_KEYS.has(p)) {
          newPerms.push(p)
        } else {
          // 无效的key（如父节点key field-group, manage-group等），丢弃
          changed = true
        }
      }
      if (changed) {
        // 去重
        const unique = [...new Set(newPerms)]
        await client.query('UPDATE dt_roles SET permissions = $1 WHERE id = $2', [JSON.stringify(unique), role.id])
      }
    }
    if (rolesToMigrate.rows.length > 0) console.log('[init] 权限key迁移完成')

    // 补全隐含的查看权限：有管理子权限(编辑/删除/恢复/日志)但没查看权限的，自动补上
    const allRoles = await client.query('SELECT id, permissions FROM dt_roles')
    for (const role of allRoles.rows) {
      const perms = role.permissions || []
      let updated = [...perms]
      const hasManageSub = perms.some(p => p.startsWith('manage_') && p !== 'manage_view')
      if (hasManageSub && !perms.includes('manage_view')) updated.push('manage_view')
      const hasLedgerSub = perms.some(p => p.startsWith('ledger_') && p !== 'ledger_view' && p !== 'ledger_parse')
      if (hasLedgerSub && !perms.includes('ledger_view')) updated.push('ledger_view')
      if (updated.length !== perms.length) {
        await client.query('UPDATE dt_roles SET permissions = $1 WHERE id = $2', [JSON.stringify([...new Set(updated)]), role.id])
      }
    }

    // 确保内置角色包含必要权限（追加缺失的，不删除已有的自定义权限）
    const adminRequiredPerms = [...ALL_VALID_LEAF_KEYS]
    const userRequiredPerms = ['translate','manage_view','manage_import','manage_edit','manage_log','insertgen','multidate','ledger_parse','ledger_view','ledger_edit','ledger_log']
    for (const [roleKey, requiredPerms] of [['admin', adminRequiredPerms], ['user', userRequiredPerms]]) {
      const existing = await client.query('SELECT permissions FROM dt_roles WHERE role_key = $1 AND is_builtin = true', [roleKey])
      if (existing.rows.length > 0) {
        const current = existing.rows[0].permissions || []
        const missing = requiredPerms.filter(p => !current.includes(p))
        if (missing.length > 0) {
          const updated = [...current, ...missing]
          await client.query('UPDATE dt_roles SET permissions = $1 WHERE role_key = $2', [JSON.stringify(updated), roleKey])
          console.log(`[init] 内置角色 "${roleKey}" 补充了 ${missing.length} 个缺失权限: ${missing.join(', ')}`)
        }
      }
    }
  } catch (err) {
    console.error('[init] 建表失败:', err.message)
    process.exit(1)
  } finally {
    client.release()
  }
}

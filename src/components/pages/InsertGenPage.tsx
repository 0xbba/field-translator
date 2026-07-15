import { Card, Typography, Divider, Input, Select, Button, Table, Switch, Upload as AntUpload } from 'antd'
import type { UploadProps } from 'antd'
import { InboxOutlined, TableOutlined, CodeOutlined, CopyOutlined, CheckOutlined, DownloadOutlined } from '@ant-design/icons'
import type { UseInsertReturn } from '../../hooks/useInsert'
import { COLORS } from '../../constants'
import { useAppContext } from '../../contexts/AppContext'
import { timestamp } from '../../utils/format'
import type { InsertField, InsertDialect } from '../../types'

interface InsertGenPageProps {
  insertHook: UseInsertReturn
}

export default function InsertGenPage({ insertHook }: InsertGenPageProps) {
  const { message } = useAppContext()
  const {
    insertExcelData,
    insertExcelHeaders,
    insertDialect,
    insertTableName,
    insertFields,
    insertParseText,
    insertResult,
    insertCopied,
    setInsertDialect,
    setInsertTableName,
    setInsertFields,
    setInsertParseText,
    setInsertCopied,
    insertHandleFile,
    insertApplyParse,
    insertDoGenerate,
  } = insertHook

  const draggerCustomRequest: UploadProps['customRequest'] = ({ onSuccess }) => {
    setTimeout(() => onSuccess?.('ok'), 0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 步骤1：上传Excel */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Typography.Text strong style={{ fontSize: '0.95rem' }}>上传数据文件</Typography.Text>
        </div>
        <p style={{ fontSize: '0.75rem', color: COLORS.textTertiary, marginBottom: 12 }}>
          上传包含数据的 Excel 文件，自动解析列名和数据
        </p>

        <AntUpload.Dragger
          accept=".xlsx,.xls,.csv"
          showUploadList={false}
          customRequest={draggerCustomRequest}
          beforeUpload={(file) => { insertHandleFile(file); return false }}
          style={{ marginBottom: 0 }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text" style={{ fontSize: '0.85rem' }}>点击或拖拽文件到此处上传</p>
          <p className="ant-upload-hint" style={{ fontSize: '0.75rem' }}>支持 .xlsx / .xls / .csv</p>
        </AntUpload.Dragger>

        {insertExcelData && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: COLORS.textPrimary }}>
              <TableOutlined style={{ fontSize: 16, color: COLORS.primary }} />
              <span style={{ fontWeight: 700 }}>{insertExcelData.length} 行 × {insertExcelHeaders.length} 列</span>
            </div>
          </>
        )}
      </Card>

      {/* 步骤2：字段配置（上传后显示） */}
      {insertExcelData && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Typography.Text strong style={{ fontSize: '0.95rem' }}>配置字段</Typography.Text>
          </div>
          <p style={{ fontSize: '0.75rem', color: COLORS.textTertiary, marginBottom: 12 }}>
            设置目标表名和字段引号规则，支持解析 CREATE TABLE 语句自动推断
          </p>

          {/* 表名 + 目标库 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', color: COLORS.textPrimary, fontWeight: 700, whiteSpace: 'nowrap' }}>表名</span>
              <Input size="small" value={insertTableName} onChange={e => setInsertTableName(e.target.value)}
                placeholder="输入目标表名" style={{ width: 220 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', color: COLORS.textPrimary, fontWeight: 700, whiteSpace: 'nowrap' }}>目标库</span>
              <Select size="small" value={insertDialect} onChange={v => setInsertDialect(v as InsertDialect)} style={{ width: 120 }}>
                <Select.Option value="hive">Hive</Select.Option>
                <Select.Option value="pg">PostgreSQL</Select.Option>
              </Select>
            </div>
          </div>

          {/* 解析输入区 */}
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: '0.75rem', color: COLORS.textTertiary, marginBottom: 8 }}>
              粘贴 CREATE TABLE 语句或字段定义（如 <code style={{ fontFamily: 'monospace', background: 'rgba(22,119,255,0.08)', padding: '1px 4px', borderRadius: 4 }}>schema.table.field type</code>），点击解析自动填充
            </p>
            <Input.TextArea value={insertParseText} onChange={e => setInsertParseText(e.target.value)}
              placeholder={`-- 方式1: CREATE TABLE 语句\nCREATE TABLE jyh_zg_simple_day_user (\n  prod_id bigint,\n  user_name text,\n  balance numeric(18,2)\n);\n\n-- 方式2: 字段定义\njyh_zg_simple_day_user.prod_id bigint\njyh_zg_simple_day_user.user_name text\njyh_zg_simple_day_user.balance numeric(18,2)\n\n-- 方式3: 无表名\nprod_id bigint\nuser_name text`}
              autoSize={{ minRows: 6, maxRows: 12 }}
              style={{ fontFamily: 'monospace' }}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start' }}>
              <Button size="small" onClick={insertApplyParse} disabled={!insertParseText.trim()}>解析并填充</Button>
            </div>
          </div>

          {/* 字段列表 */}
          <Table<InsertField>
            size="small"
            dataSource={insertFields}
            rowKey={(_, index) => String(index ?? 0)}
            pagination={false}
            scroll={{ x: 500 }}
            columns={[
              {
                title: <span style={{ whiteSpace: 'nowrap' }}>导入文件首行内容</span>,
                key: 'excelCol',
                width: 180,
                ellipsis: true,
                render: (_, record, index) => <span style={!record.enabled ? { color: COLORS.textQuaternary } : undefined}>{insertExcelHeaders[index] ?? '-'}</span>,
              },
              {
                title: '字段名',
                dataIndex: 'name',
                key: 'name',
                width: 220,
                render: (v, _, index) => (
                  <Input size="small" value={v} onChange={e => { const nf = [...insertFields]; nf[index] = { ...nf[index], name: e.target.value }; setInsertFields(nf) }} style={{ width: '100%' }} disabled={!insertFields[index]?.enabled} />
                ),
              },
              {
                title: '操作',
                key: 'actions',
                width: 160,
                align: 'center' as const,
                fixed: 'right' as const,
                render: (_, record, index) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                      导入<Switch size="small" checked={record.enabled} onChange={checked => { const nf = [...insertFields]; nf[index] = { ...nf[index], enabled: checked }; setInsertFields(nf) }} />
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                      引号<Switch size="small" checked={record.quoted} onChange={checked => { const nf = [...insertFields]; nf[index] = { ...nf[index], quoted: checked }; setInsertFields(nf) }} />
                    </span>
                  </div>
                ),
              },
            ]}
          />

          <Divider style={{ margin: '12px 0' }} />

          {/* 生成按钮 + 复制/下载 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button type="primary" size="small" onClick={insertDoGenerate} disabled={!insertFields.length}
              icon={<CodeOutlined style={{ fontSize: 14 }} />}>
              生成INSERT语句
            </Button>
            {insertResult && (
              <>
                <Button type="dashed" size="small" onClick={() => {
                  navigator.clipboard.writeText(insertResult).then(() => {
                    setInsertCopied(true)
                    setTimeout(() => setInsertCopied(false), 1500)
                    message.success('已复制到剪贴板')
                  })
                }} icon={insertCopied ? <CheckOutlined style={{ fontSize: 14 }} /> : <CopyOutlined style={{ fontSize: 14 }} />}>
                  {insertCopied ? '已复制' : '复制全部'}
                </Button>
                <Button type="dashed" size="small" onClick={() => {
                  const ext = insertDialect === 'pg' ? 'sql' : 'hql'
                  const blob = new Blob([insertResult], { type: 'text/plain;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = `insert_${insertTableName}_${timestamp()}.${ext}`; a.click(); URL.revokeObjectURL(url)
                  message.success('文件已下载')
                }} icon={<DownloadOutlined style={{ fontSize: 14 }} />}>下载文件</Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* 步骤3：生成结果 */}
      {insertResult && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Typography.Text strong style={{ fontSize: '0.95rem' }}>生成结果</Typography.Text>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: '0.75rem', color: COLORS.textTertiary }}>{insertDialect === 'pg' ? 'PostgreSQL' : 'Hive'}，{insertExcelData?.length ?? 0} 条语句</span>
          </div>
          <Input.TextArea
            value={insertResult}
            readOnly
            autoSize={{ minRows: 8, maxRows: 20 }}
            style={{ fontFamily: 'monospace', background: '#fafafa' }}
          />
        </Card>
      )}

      {/* 步骤4：数据预览（上传后显示） */}
      {insertExcelData && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: COLORS.textPrimary, marginBottom: 12 }}>
            <span style={{ fontWeight: 700 }}>数据预览</span>
          </div>
          <Table
            size="small"
            dataSource={insertExcelData.slice(0, 5).map((row, ri) => {
              const rec: Record<string, any> = { _key: String(ri) }
              row.forEach((val: any, ci: number) => { rec[`c${ci}`] = val ?? '' })
              return rec
            })}
            rowKey="_key"
            pagination={false}
            scroll={{ x: 'max-content', y: 200 }}
            columns={[
              { title: '#', key: '_idx', width: 40, align: 'center' as const, render: (_, __, index) => <Typography.Text type="secondary">{index + 1}</Typography.Text> },
              ...insertExcelHeaders.map((h: string, i: number) => ({
                title: h,
                key: `c${i}`,
                dataIndex: `c${i}`,
                width: Math.max(80, h.length * 10 + 24),
                ellipsis: true,
              })),
            ]}
          />
          {insertExcelData.length > 5 && <p style={{ fontSize: '0.75rem', color: '#bfbfbf', textAlign: 'center', marginTop: 4 }}>仅显示前 5 行，共 {insertExcelData.length} 行</p>}
        </Card>
      )}
    </div>
  )
}

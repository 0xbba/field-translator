import { useState } from 'react'
import { Card, Typography, Segmented, DatePicker, Button, Tag, Input, Collapse } from 'antd'
import { CopyOutlined, CloseOutlined, CheckOutlined } from '@ant-design/icons'
import type { UseMultidateReturn } from '../../hooks/useMultidate'
import { MD_PLACEHOLDERS, MD_FORMAT, COLORS } from '../../constants'
import { useAppContext } from '../../contexts/AppContext'
import type { MdPicker } from '../../types'

interface MultidatePageProps {
  multidateHook: UseMultidateReturn
}

export default function MultidatePage({ multidateHook }: MultidatePageProps) {
  const { message } = useAppContext()
  const {
    mdPicker,
    mdRange,
    mdTemplate,
    mdDateList,
    mdResult,
    setMdPicker,
    setMdRange,
    setMdTemplate,
    handleMdGenerate,
    handleMdClear,
  } = multidateHook

  const [templateCopied, setTemplateCopied] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <Card>
        <Typography.Text strong style={{ fontSize: '0.95rem' }}>多账期SQL生成</Typography.Text>
        <p style={{ fontSize: '0.75rem', color: COLORS.textTertiary, marginBottom: 12, marginTop: 4 }}>
          选择账期范围，编写含占位符的SQL模板，自动生成每个账期的SQL语句
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <Segmented
            value={mdPicker}
            onChange={v => setMdPicker(v as MdPicker)}
            options={[
              { label: '按日', value: 'date' },
              { label: '按月', value: 'month' },
              { label: '按年', value: 'year' },
            ]}
            size="small"
          />
          <DatePicker.RangePicker
            value={mdRange}
            onChange={v => setMdRange(v ? [v[0], v[1]] : [null, null])}
            picker={mdPicker === 'date' ? 'date' : mdPicker === 'month' ? 'month' : 'year'}
            format={MD_FORMAT[mdPicker]}
            allowClear
          />
          <Button type="primary" onClick={handleMdGenerate} disabled={!mdRange[0] || !mdRange[1]}>生成</Button>
        </div>

        <div style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>SQL模板</span>
            <Tag color="processing" style={{ fontSize: '0.7rem' }}>{MD_PLACEHOLDERS[mdPicker]}</Tag>
            <span style={{ fontSize: '0.7rem', color: COLORS.textTertiary, whiteSpace: 'nowrap' }}>占位符 {MD_PLACEHOLDERS[mdPicker]} 将被替换为对应账期</span>
          </div>
          <Input.TextArea
            value={mdTemplate}
            onChange={e => setMdTemplate(e.target.value)}
            placeholder={mdPicker === 'date'
              ? "insert overwrite table_name partition (date_no_ = ${yyyyMMdd})\nselect * from source_table\nwhere date_no_ = '${yyyyMMdd}';"
              : mdPicker === 'month'
              ? "insert overwrite table_name partition (month_id_ = ${yyyyMM})\nselect * from source_table\nwhere month_id_ = '${yyyyMM}';"
              : "insert overwrite table_name partition (year_id_ = ${yyyy})\nselect * from source_table\nwhere year_id_ = '${yyyy}';"}
            autoSize={{ minRows: 6, maxRows: 12 }}
            style={{ fontFamily: 'monospace' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {mdResult && (
              <Button type="primary" size="small" onClick={() => {
                navigator.clipboard.writeText(mdResult).then(() => {
                  setTemplateCopied(true); setTimeout(() => setTemplateCopied(false), 1500); message.success('已复制到剪贴板')
                }).catch(() => message.error('复制失败'))
              }}
                icon={templateCopied ? <CheckOutlined style={{ fontSize: 14 }} /> : <CopyOutlined style={{ fontSize: 14 }} />}
              >
                {templateCopied ? '已复制' : '复制生成语句'}
              </Button>
            )}
            <Button type="default" size="small" onClick={handleMdClear} icon={<CloseOutlined style={{ fontSize: 14 }} />}>清空</Button>
          </div>
        </div>
      </Card>

      {mdDateList.length > 0 && (
        <Collapse
          size="small"
          items={[{
            key: 'datelist',
            label: <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Typography.Text strong style={{ fontSize: '0.95rem' }}>账期清单</Typography.Text>
              <Tag color="processing">{mdDateList.length} 个账期</Tag>
            </div>,
            children: <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {mdDateList.map(dt => (
                <Tag key={dt} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{dt}</Tag>
              ))}
            </div>,
          }]}
        />
      )}

      {mdResult && (
        <Card>
          <Typography.Text strong style={{ fontSize: '0.95rem' }}>生成结果</Typography.Text>
          <Input.TextArea
            value={mdResult}
            readOnly
            autoSize={{ minRows: 8, maxRows: 20 }}
            style={{ fontFamily: 'monospace', background: '#fafafa', marginTop: 8 }}
          />
        </Card>
      )}
    </div>
  )
}

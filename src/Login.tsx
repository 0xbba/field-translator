import { useState } from 'react'
import { Card, Input, Button, Typography, App as AntApp } from 'antd'
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons'
import { COLORS } from './constants'

export interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'user' | string
  roleName: string
  displayName: string
  permissions: string[]
}

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<void>
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { message } = AntApp.useApp()

  const handleLogin = async () => {
    if (!username || !password) {
      message.warning('请输入用户名和密码')
      return
    }
    setLoading(true)
    try {
      await onLogin(username, password)
    } catch (err: any) {
      message.error(err?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 10,
            background: COLORS.primary, color: '#fff', marginBottom: 12,
          }}>
            <GlobalOutlined style={{ fontSize: 24 }} />
          </div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>数据组常用工具</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: '0.8rem' }}>请登录后使用</Typography.Text>
        </div>
        <Input
          prefix={<UserOutlined />}
          placeholder="用户名"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onPressEnter={handleLogin}
          style={{ marginBottom: 12 }}
          size="large"
        />
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="密码"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onPressEnter={handleLogin}
          style={{ marginBottom: 16 }}
          size="large"
        />
        <Button type="primary" block size="large" loading={loading} onClick={handleLogin}>
          登录
        </Button>
      </Card>
    </div>
  )
}

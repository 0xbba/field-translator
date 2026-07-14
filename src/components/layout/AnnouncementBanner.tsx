import { useState, useEffect } from 'react'
import Marquee from 'react-fast-marquee'
import {Api } from '../../api'
import type { Announcement } from '../../types'

const AnnouncementBanner: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    Api.announcementList().then(setAnnouncements).catch(() => {})
  }, [])

  if (announcements.length === 0) return null

  const text = announcements.map(a => a.content).join('        \u25CF        ')

  return (
    <>
      <style>{`.ann-banner .rfm-marquee { animation-delay: calc(var(--duration) / -2) !important; }`}</style>
      <div className="ann-banner" style={{
        flex: 1,
        minWidth: 0,
        height: 28,
        lineHeight: '28px',
        overflow: 'hidden',
        fontSize: '0.8rem',
        color: '#1677ff',
      }}>
        <Marquee pauseOnHover gradient={false} speed={40}>
          {text}
        </Marquee>
      </div>
    </>
  )
}

export default AnnouncementBanner

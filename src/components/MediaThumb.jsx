import React, { useEffect, useRef, useState } from 'react'
import { isVideoPath } from '../utils/media'

// Grid thumbnail for a gear_photos row — image or video, decided by file
// extension (see utils/media.js). Video gets a muted, controls-less preview
// frame plus a play badge so it reads as "tap to play" rather than a broken
// image. Used by GearPhotos/SmsReview/Reports/AdminDashboard/EmployeeHome so
// none of them have to special-case video on their own.
//
// Video has no native `loading="lazy"` equivalent — unlike the <img> branch
// below, a <video src> starts fetching the moment it's in the DOM, even if
// scrolled far off-screen. A gallery of two dozen videos was found doing this
// simultaneously (Sept 2026 Supabase egress investigation), so video mounts
// its <video> tag only once an IntersectionObserver says it's actually near
// the viewport.
export default function MediaThumb({ src, alt = '', style, onClick, loading }) {
  const isVideo = isVideoPath(src)
  const containerRef = useRef(null)
  const [videoInView, setVideoInView] = useState(false)

  useEffect(() => {
    if (!isVideo) return
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVideoInView(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVideoInView(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isVideo, src])

  if (isVideo) {
    return (
      <div ref={containerRef} onClick={onClick} style={{ position: 'relative', cursor: onClick ? 'pointer' : undefined, ...style }}>
        {videoInView && (
          <video src={src} muted playsInline preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 'inherit' }} />
        )}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)', borderRadius: 'inherit',
        }}>
          <div style={{
            width: '1.6em', height: '1.6em', borderRadius: '50%', background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 0, height: 0, marginLeft: '0.15em', borderTop: '0.5em solid transparent', borderBottom: '0.5em solid transparent', borderLeft: '0.8em solid #fff' }} />
          </div>
        </div>
      </div>
    )
  }
  return <img src={src} alt={alt} loading={loading} onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, ...style }} />
}

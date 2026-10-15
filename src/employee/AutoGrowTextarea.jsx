import React, { useRef, useLayoutEffect, useEffect } from 'react'

// A textarea that starts about 3 lines tall and grows to fit all its text,
// so long notes wrap and stay fully visible instead of scrolling sideways in
// a one-line input. No inner scrollbar; the page scrolls instead.
// All other props (value, onChange, onBlur, placeholder...) pass straight through.
export default function AutoGrowTextarea({ rows = 3, className = '', ...props }) {
  const ref = useRef(null)

  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // box-sizing is border-box, so add the borders on top of scrollHeight.
    const border = el.offsetHeight - el.clientHeight
    el.style.height = `${el.scrollHeight + border}px`
  }

  useLayoutEffect(fit, [props.value])

  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <textarea ref={ref} rows={rows} className={`emp-autogrow ${className}`.trim()} {...props} />
  )
}

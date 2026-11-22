/**
 * The handmade beer glass logo (branding/logo.svg, also public/favicon.svg), inline so it needs no
 * request. With `background`, it sits on the dark brown it was drawn for (for light pages).
 */
export function Logo({ size = 36, background = false }: { size?: number; background?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {background && <rect width="16" height="16" rx="3.5" fill="#2b1a0b" />}
      <g transform="translate(8, 7.8) scale(0.5)">
        <path d="M -7 -10 L -5 14 Q -5 14 5 14 L 7 -10 Z" fill="#f59e0b" opacity="0.3" />
        <circle cx="-5" cy="-10" r="3" fill="#fefece" opacity="0.7" />
        <circle cx="0" cy="-11" r="3.5" fill="#fefece" opacity="0.7" />
        <circle cx="5" cy="-10" r="3" fill="#fefece" opacity="0.7" />
        <path d="M -5 -5 Q -4 5 -3 12" stroke="#f59e0b" strokeWidth="1.5" fill="none" opacity="0.5" />
        <path
          d="M -8 -10 L -6 12 Q -6 14 -4 14 L 4 14 Q 6 14 6 12 L 8 -10 Z"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
        />
      </g>
    </svg>
  )
}

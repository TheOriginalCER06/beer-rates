/** The beer glass from public/favicon.svg, inline so it follows the header without a request. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#2b1a0b" />
      <path d="M19 20h22l-2.6 32a3 3 0 0 1-3 2.8H24.6a3 3 0 0 1-3-2.8Z" fill="#f59e0b" />
      <path d="M41 25h4.5a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H40" fill="none" stroke="#f8bf2a" strokeWidth="3.5" />
      <path d="M23 30v18M29 30v20M35 30v18" stroke="#fde08f" strokeWidth="2" strokeLinecap="round" opacity=".6" />
      <circle cx="22" cy="18" r="5" fill="#fff8e6" />
      <circle cx="30" cy="15" r="6" fill="#fff8e6" />
      <circle cx="38" cy="18" r="5" fill="#fff8e6" />
      <rect x="18" y="17" width="24" height="5" rx="2.5" fill="#fff8e6" />
    </svg>
  )
}

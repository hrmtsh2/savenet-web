export function SaveNetLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 3 L26 3 Q29 3 29 6 L29 29 L16 21 L3 29 L3 6 Q3 3 6 3 Z" fill="rgba(255,255,255,0.25)" />
      <path d="M6 3 L26 3 Q29 3 29 6 L29 13 L3 13 L3 6 Q3 3 6 3 Z" fill="rgba(255,255,255,0.45)" />
      <line x1="23" y1="6" x2="23" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="9" x2="26" y2="9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="21" y1="7" x2="25" y2="11" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="25" y1="7" x2="21" y2="11" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

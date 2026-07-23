type BrandProperties = Readonly<{
  compact?: boolean;
  href?: string;
}>;

export function ConseraMark({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      className={`consera-mark ${className}`}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="consera-mark-gradient" x1="6" x2="43" y1="9" y2="39">
          <stop stopColor="#00ccf8" />
          <stop offset="1" stopColor="#00ffb7" />
        </linearGradient>
      </defs>
      <path
        className="consera-mark__outer"
        d="M36.8 10.3A18 18 0 1 0 36.8 37.7"
        fill="none"
        stroke="url(#consera-mark-gradient)"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        className="consera-mark__inner"
        d="M32.4 16.1A11 11 0 1 0 32.4 31.9"
        fill="none"
        stroke="#00ffb7"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        className="consera-mark__signal"
        d="M27 24H42"
        fill="none"
        stroke="#eafcff"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <circle className="consera-mark__node" cx="42" cy="24" fill="#00ccf8" r="3.2" />
      <circle className="consera-mark__core" cx="23" cy="24" fill="#030712" r="3.5" />
      <circle cx="23" cy="24" fill="#00ffb7" r="1.7" />
    </svg>
  );
}

export function Brand({ compact = false, href = "/" }: BrandProperties) {
  return (
    <a aria-label="Consera home" className={`brand ${compact ? "brand--compact" : ""}`} href={href}>
      <ConseraMark />
      {!compact && <span>Consera</span>}
    </a>
  );
}

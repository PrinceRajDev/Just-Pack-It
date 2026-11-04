/** Decorative local market artwork; not a photograph of a listed shop. */
export function MarketLoginArt({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 460 300" fill="none" aria-hidden="true">
      <ellipse cx="230" cy="278" rx="204" ry="12" fill="#071f17" opacity=".25" />
      <path d="M35 32Q235 65 425 30" stroke="#d8bd79" strokeWidth="4" />
      {Array.from({ length: 15 }, (_, i) => (
        <g key={i} transform={`translate(${48 + i * 26} ${37 + Math.sin(i / 5) * 15})`}>
          <path d="M0 0v68" stroke="#a28d47" />
          {Array.from({ length: i % 3 === 0 ? 8 : 5 }, (_, j) => (
            <circle
              key={j}
              cy={j * 8 + 9}
              r="5"
              fill={i % 3 === 0 ? "#eaa83c" : i % 3 === 1 ? "#db7640" : "#dbd19a"}
              stroke="#795a32"
              strokeWidth=".7"
            />
          ))}
        </g>
      ))}
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <g key={n} transform={`translate(${30 + (n % 3) * 67} ${160 + Math.floor(n / 3) * 48})`}>
          <path
            d="M5 8Q30-5 55 8L64 67Q30 80 0 67Z"
            fill={n % 2 ? "#c59a65" : "#d7b57d"}
            stroke="#684d32"
            strokeWidth="2"
          />
          <ellipse
            cx="30"
            cy="9"
            rx="27"
            ry="10"
            fill={["#d4bd73", "#bc753f", "#e5d4a5"][n % 3]}
            stroke="#684d32"
            strokeWidth="2"
          />
          {Array.from({ length: 16 }, (_, j) => (
            <circle
              key={j}
              cx={10 + (j % 6) * 8}
              cy={5 + Math.floor(j / 6) * 4}
              r="1.3"
              fill="#765637"
            />
          ))}
          <path d="M10 29q17 7 38 0M13 54q13 7 33 0" stroke="#ac824e" />
        </g>
      ))}
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <g key={n} transform={`translate(${246 + (n % 3) * 57} ${154 + Math.floor(n / 3) * 63})`}>
          <path
            d="M0 13h54v58H0z"
            fill={n % 2 ? "#9b7946" : "#b79358"}
            stroke="#503f28"
            strokeWidth="2"
          />
          {[28, 43, 58].map((y) => (
            <path key={y} d={`M2 ${y}h50`} stroke="#70552f" />
          ))}
          {Array.from({ length: 9 }, (_, j) => (
            <circle
              key={j}
              cx={9 + (j % 3) * 17}
              cy={5 + Math.floor(j / 3) * 9}
              r="8"
              fill={["#92a34a", "#cf643d", "#e0b65b", "#6d9844", "#d2773f", "#9eab59"][n]}
              stroke="#59613a"
              strokeWidth=".8"
            />
          ))}
        </g>
      ))}
      <path
        d="M214 245q-12-65 4-89q22 38 2 89M226 244q-4-60 20-66q7 32-16 66"
        fill="#769047"
        stroke="#263e25"
        strokeWidth="2"
      />
      <path d="M205 241h33l-4 38h-24z" fill="#bf9360" stroke="#684d32" strokeWidth="2" />
    </svg>
  );
}

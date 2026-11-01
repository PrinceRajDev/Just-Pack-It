/** Brand illustration only. Does not represent a balance or verified transfer. */
export function SettlementIllustration({ receiptOnly = false }: { receiptOnly?: boolean }) {
  return (
    <svg viewBox="0 0 360 210" fill="none" aria-hidden="true" className="seller-settlement-art">
      <ellipse cx="184" cy="185" rx="154" ry="15" fill="#dfe7bc" />
      <path
        d="M65 177C9 145 34 106 65 143C20 74 73 57 88 127C77 59 118 58 117 116L136 183Z"
        fill="#b6d478"
      />
      <path
        d="M261 183C253 142 266 89 285 107C301 123 277 149 281 153C325 104 356 144 308 183Z"
        fill="#9ec65b"
      />
      <g transform={receiptOnly ? "translate(-35 0)" : undefined}>
        <rect
          x="209"
          y="37"
          width="111"
          height="146"
          rx="16"
          transform="rotate(7 209 37)"
          fill="#fdfdf1"
        />
        <path
          d="M225 65L289 73M222 87L286 95M220 109L269 115M217 131L250 135"
          stroke="#d9e4b0"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle cx="284" cy="157" r="24" fill="#a8cd2a" />
        {receiptOnly ? (
          <text x="272" y="167" fontSize="31" fontFamily="Arial" fill="white">
            ₹
          </text>
        ) : (
          <path
            d="M273 156L282 165L297 148"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
      {!receiptOnly && (
        <g>
          <circle cx="159" cy="56" r="35" fill="#e3a928" />
          <circle cx="159" cy="56" r="28" fill="#ffda65" stroke="#f5c34c" strokeWidth="3" />
          <text x="145" y="68" fontSize="37" fontFamily="Arial" fill="#a57814">
            ₹
          </text>
          <rect x="82" y="78" width="135" height="106" rx="16" fill="#276233" />
          <rect
            x="89"
            y="86"
            width="119"
            height="88"
            rx="10"
            fill="#40813b"
            stroke="#b9d879"
            strokeWidth="2"
          />
          <rect
            x="170"
            y="111"
            width="54"
            height="35"
            rx="9"
            fill="#1b4c2d"
            stroke="#83ab51"
            strokeWidth="2"
          />
          <circle cx="184" cy="128" r="4" fill="#d3e990" />
          <text x="120" y="151" fontSize="51" fontFamily="Arial" fill="#d7e974">
            ₹
          </text>
          <ellipse cx="77" cy="184" rx="29" ry="9" fill="#d49b20" />
          <path d="M48 166H106V184C106 196 48 196 48 184Z" fill="#f3c546" />
          <ellipse cx="77" cy="166" rx="29" ry="9" fill="#ffe086" />
        </g>
      )}
      <path
        d="M131 25L126 14M155 17L157 6M181 26L190 15"
        stroke="#8eb524"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

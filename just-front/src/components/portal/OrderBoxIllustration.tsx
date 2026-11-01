/** Decorative empty parcel, not an order or inventory record. */
export function OrderBoxIllustration() {
  return (
    <svg viewBox="0 0 300 190" fill="none" aria-hidden="true" className="seller-order-box-art">
      <ellipse cx="150" cy="169" rx="119" ry="13" fill="#eae4cc" />
      <path
        d="M60 160C29 135 38 102 57 120C39 79 74 69 79 116C81 83 104 93 91 126L101 164Z"
        fill="#a6c977"
      />
      <path
        d="M208 164C227 125 215 88 237 99C254 108 231 134 234 139C270 111 280 141 243 165Z"
        fill="#a6c977"
      />
      <path d="M86 91L150 68L216 92L151 118Z" fill="#b98221" />
      <path d="M86 91L151 113V171L86 151Z" fill="#efbd54" />
      <path d="M151 113L216 92V151L151 171Z" fill="#f7d77e" />
      <path d="M86 91L151 113L127 137L57 112Z" fill="#ffe4a0" />
      <path d="M151 113L216 92L244 111L173 137Z" fill="#ffebb0" />
      <path d="M86 91L150 68L124 53L61 73Z" fill="#f7d77e" />
      <path d="M150 68L216 92L239 74L178 52Z" fill="#ffe7a4" />
      <path
        d="M132 36L127 26M155 31L157 18M179 37L187 27"
        stroke="#78a82c"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

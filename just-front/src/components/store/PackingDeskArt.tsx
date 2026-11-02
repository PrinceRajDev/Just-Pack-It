import { LogoMark } from "@/components/brand/Logo";
/** Decorative packaging artwork, never a product or live shop. */
export function PackingDeskArt() {
  return (
    <div className="packing-art" aria-hidden="true">
      <svg viewBox="0 0 280 230" fill="none">
        <ellipse cx="142" cy="216" rx="112" ry="7" fill="#b89b62" opacity=".2" />
        <path
          d="M26 205C4 169 19 153 37 185C25 139 49 136 51 178C68 147 87 164 60 198"
          fill="#739048"
        />
        <path d="M205 207C232 169 252 177 236 201C271 187 274 208 240 215" fill="#54793e" />
        <path d="M65 82L179 74L197 207L70 215Z" fill="#d7ac66" stroke="#a78046" />
        <path d="M179 74L216 91L220 200L197 207Z" fill="#bd8c49" />
        <path
          d="M78 82C73 9 157 5 152 79M95 81C89 25 139 20 135 80"
          stroke="#87602d"
          strokeWidth="7"
        />
        <path d="M151 79C156 47 174 24 184 46C190 60 174 79 151 79Z" fill="#527b38" />
        <path d="M156 78C173 68 187 64 194 74" stroke="#33562e" strokeWidth="2" />
        <path d="M207 40L248 59L265 124L208 137L190 70Z" fill="#f0d7a4" stroke="#b1935d" />
        <circle cx="213" cy="58" r="4" stroke="#987340" />
        <path d="M212 57C237 16 185 16 171 46" stroke="#9a713a" strokeWidth="3" />
        <text x="212" y="84" fill="#294b30" fontSize="13" transform="rotate(-10 212 84)">
          Local shops
        </text>
        <text x="215" y="104" fill="#294b30" fontSize="12" transform="rotate(-10 215 104)">
          Local delivery
        </text>
        <path
          d="M27 49L42 58M46 26L53 41M15 81L33 84"
          stroke="#a2bf16"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <LogoMark className="packing-art-brand" />
    </div>
  );
}

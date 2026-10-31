import { useId } from "react";
/** Decorative illustration of a neighbourhood counter, never a live shop listing. */
export function NeighbourhoodIllustration({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="120" y1="55" x2="230" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5e9c7" />
          <stop offset="1" stopColor="#e0c990" />
        </linearGradient>
      </defs>
      <ellipse cx="164" cy="180" rx="143" ry="12" fill="#dfd2ab" opacity=".4" />
      <path
        d="M38 166C7 129 35 91 71 100C37 54 86 30 119 55C132 6 171 22 181 48C210 6 251 41 240 70C288 58 304 93 280 121L295 173Z"
        fill="#ece3c8"
        opacity=".65"
      />
      <path
        d="M33 148C18 122 32 113 40 133C30 104 49 99 49 128C51 100 68 109 56 136L54 170H42Z"
        fill="#82954d"
      />
      <path
        d="M260 149C246 120 258 109 270 134C263 95 284 101 282 132C292 108 308 122 289 148L280 177H269Z"
        fill="#5c813f"
      />
      <path d="M88 66H247V179H88Z" fill={`url(#${id})`} />
      <path d="M99 78H236V177H99Z" fill="#f8efd6" />
      <path d="M94 48H242V66H94Z" fill="#245a3b" />
      <path d="M85 64H251L260 91H75Z" fill="#edf0d7" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${88 + i * 34} 64h17l7 27h-20z`} fill="#5c8d53" />
      ))}
      <path
        d="M75 91H260V98C260 110 243 110 241 98C238 110 221 110 220 98C216 110 200 110 199 98C195 110 179 110 178 98C174 110 158 110 157 98C153 110 137 110 136 98C132 110 116 110 115 98C111 110 95 110 94 98C91 110 75 108 75 98Z"
        fill="#356c47"
      />
      <path d="M110 111H163V155H110Z" fill="#2d5842" />
      <path d="M115 116H158V139H115Z" fill="#78916c" />
      <path d="M136 116V150M115 139H158" stroke="#cbb982" strokeWidth="3" />
      <path d="M177 109H224V178H177Z" fill="#234832" />
      <path d="M183 116H218V149H183Z" fill="#6b8365" />
      <circle cx="216" cy="159" r="2" fill="#d7bc73" />
      <path d="M103 155H168V174H103Z" fill="#bd985c" />
      <path d="M108 160H163M108 167H163" stroke="#d8ba7d" />
      <circle cx="115" cy="150" r="6" fill="#a9b655" />
      <circle cx="127" cy="149" r="7" fill="#7e9d48" />
      <circle cx="140" cy="150" r="6" fill="#e4a24e" />
      <circle cx="153" cy="150" r="5" fill="#b36a36" />
      <path d="M56 150H96V179H56Z" fill="#d0ad6c" />
      <path d="M61 158H91M61 170H91" stroke="#ac884e" />
      <circle cx="67" cy="146" r="7" fill="#749348" />
      <circle cx="80" cy="146" r="8" fill="#89a64f" />
      <circle cx="86" cy="150" r="6" fill="#d69a43" />
      <path d="M232 155H256V178H232Z" fill="#d6b277" />
      <path d="M239 155v-9a5 5 0 0 1 10 0v9" stroke="#b38c4f" strokeWidth="2" />
      <path d="M239 164l5-3 5 3v6l-5 3-5-3z" fill="#35633c" />
      <path d="M265 160H285L282 180H268Z" fill="#b48d56" />
      <path
        d="M276 164v-34M276 150c-15-1-19-13-15-18 12-1 17 9 15 18ZM276 142c0-14 8-21 15-18 5 10-3 18-15 18Z"
        stroke="#56743d"
        strokeWidth="3"
        fill="#809649"
      />
      <path
        d="M120 48V35h24v13M180 48V29h18v19M207 48V33h15v15"
        stroke="#bda565"
        strokeWidth="2"
        fill="#d8b76b"
      />
      <path
        d="M153 48V32c-16-8-14-20-5-19 7 1 12 16 5 35ZM161 48V30c2-15 14-19 17-10 2 8-11 14-17 28Z"
        fill="#72944c"
      />
    </svg>
  );
}

const palette = {
  orange: "#F05A24",
  terracotta: "#C94B24",
  cream: "#FFF9F2",
  peach: "#FFE8D8",
  white: "#FFFFFF",
  brown: "#30231D",
  warmGrey: "#8A7D73",
  border: "#F0E2D5",
  green: "#39804B",
} as const;

export const theme = {
  primary: palette.orange,
  onPrimary: palette.white,
  hero: palette.peach,
  selected: palette.peach,
  success: "#E7F2E8",
  successInk: palette.green,
  canvas: palette.cream,
  surface: palette.white,
  elevated: palette.white,
  surfaceSoft: palette.cream,
  closed: "#F0EBE6",
  border: palette.border,
  tileBorder: palette.border,
  controlBorder: palette.border,
  ink: palette.brown,
  accentInk: palette.terracotta,
  secondary: palette.warmGrey,
  muted: palette.warmGrey,
  disabled: palette.border,
  error: "#A33225",
  errorBorder: "#CA6B58",
  warning: palette.peach,
  warningInk: "#753C25",
  warningBorder: palette.terracotta,
  overlay: "rgba(48,35,29,0.48)",
  overlayStrong: "rgba(48,35,29,0.76)",
} as const;

export const cardShadow = {
  shadowColor: palette.brown,
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

// All screens use the same palette, regardless of device appearance.
export function themedStyles<T extends object>(create: () => T): T {
  return create();
}

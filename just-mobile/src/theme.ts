import { Appearance } from "react-native";

const light = {
  primary: "#D32B39",
  onPrimary: "#FFFFFF",
  hero: "#FCE6E8",
  selected: "#FCE6E8",
  success: "#E6F5E9",
  successInk: "#17632C",
  canvas: "#F4F5F7",
  surface: "#FFFFFF",
  elevated: "#FFFFFF",
  surfaceSoft: "#F0F1F4",
  border: "#DADCE2",
  tileBorder: "#B5B8C3",
  controlBorder: "#D5D6DC",
  ink: "#1C1C1C",
  accentInk: "#BF2633",
  secondary: "#686B78",
  muted: "#686B78",
  disabled: "#E7E8ED",
  error: "#B42331",
  errorBorder: "#D95763",
  warning: "#FFF1D5",
  warningInk: "#704300",
  warningBorder: "#AA690D",
  overlay: "rgba(0,0,0,0.48)",
  overlayStrong: "rgba(0,0,0,0.76)",
};

const dark: typeof light = {
  primary: "#FF4D5A",
  onPrimary: "#121212",
  hero: "#44252A",
  selected: "#44252A",
  success: "#173626",
  successInk: "#80D896",
  canvas: "#121212",
  surface: "#1E1E1E",
  elevated: "#2A2A2A",
  surfaceSoft: "#2A2A2A",
  border: "#646464",
  tileBorder: "#767676",
  controlBorder: "#767676",
  ink: "#F5F5F5",
  accentInk: "#FF707B",
  secondary: "#A0A0A0",
  muted: "#93959F",
  disabled: "#333333",
  error: "#FF8290",
  errorBorder: "#DA6672",
  warning: "#392B17",
  warningInk: "#FFD184",
  warningBorder: "#BD873A",
  overlay: "rgba(0,0,0,0.62)",
  overlayStrong: "rgba(0,0,0,0.82)",
};

function currentTheme() {
  return Appearance.getColorScheme() === "dark" ? dark : light;
}

export const theme = new Proxy(light, {
  get(_target, key: keyof typeof light) {
    return currentTheme()[key];
  },
});

// Resolve existing stylesheet names against the current appearance and cache each
// sheet by palette so a system appearance change needs no screen remount.
export function themedStyles<T extends object>(create: () => T): T {
  const sheets = new WeakMap<typeof light, T>();
  return new Proxy({} as T, {
    get(_target, key: string | symbol) {
      const palette = currentTheme();
      let sheet = sheets.get(palette);
      if (!sheet) {
        sheet = create();
        sheets.set(palette, sheet);
      }
      return sheet[key as keyof T];
    },
  });
}

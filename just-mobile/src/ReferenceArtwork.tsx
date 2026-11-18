import { useState } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";

// Only artwork is sampled from the supplied 390px reference. All text,
// controls, shop cards and product cards remain native, live components.
export function ReferenceArtwork({
  crop,
  style,
}: {
  crop: readonly [number, number, number, number];
  style?: StyleProp<ViewStyle>;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [x, y, w, h] = crop;
  const scale = Math.max(size.width / w, size.height / h);
  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((old) =>
          old.width === width && old.height === height
            ? old
            : { width, height },
        );
      }}
      style={[{ overflow: "hidden", aspectRatio: w / h }, style]}
    >
      {size.width > 0 && (
        <Image
          accessible={false}
          source={require("../assets/home-figma-artwork.png")}
          style={{
            position: "absolute",
            width: 390 * scale,
            height: 1658 * scale,
            left: -x * scale + (size.width - w * scale) / 2,
            top: -y * scale + (size.height - h * scale) / 2,
          }}
        />
      )}
    </View>
  );
}

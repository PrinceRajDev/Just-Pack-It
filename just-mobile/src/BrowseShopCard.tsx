import { theme } from "./theme";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Shop } from "./api";
import { MarketIcon } from "./MarketIcon";
import { resolveImage } from "./images";

export function BrowseShopCard({
  item,
  categoryLabel,
  actionLabel,
  onPress,
}: {
  item: Shop & { scheduleLabel?: string; hours?: string; timezone?: string };
  categoryLabel?: string;
  actionLabel?: string;
  onPress: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const cover = resolveImage(item.coverImage);
  const description =
    item.description?.trim() ||
    item.tagline?.trim() ||
    categoryLabel ||
    item.locality;
  const schedule = (item.scheduleLabel || item.hours)?.split(" · ")[0];
  let closeTime: string | undefined;
  if (item.isOpen && schedule && item.timezone) {
    try {
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: item.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
      for (const slot of schedule.split(", ")) {
        const range = /^(\d\d:\d\d) to (\d\d:\d\d)/.exec(slot);
        const overnight = /^Overnight until (\d\d:\d\d)$/.exec(slot);
        if (overnight && now < overnight[1]) closeTime = overnight[1];
        if (range && now >= range[1] && (now < range[2] || range[2] < range[1]))
          closeTime = range[2];
        if (closeTime) break;
      }
    } catch {
      // Older or incomplete shop records can still show the API's open status.
    }
  }
  const availability = item.isOpen
    ? closeTime
      ? `Open until ${closeTime}`
      : schedule && /^open\b/i.test(schedule)
        ? schedule
        : "Open now"
    : schedule && /^closed\b/i.test(schedule)
      ? schedule
      : "Closed";
  const metadata = [
    availability,
    Number.isFinite(item.distanceKm)
      ? `${item.distanceKm!.toFixed(1)} km`
      : undefined,
    Number.isFinite(item.rating) ? `★ ${item.rating!.toFixed(1)}` : undefined,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      onPress={onPress}
      style={styles.card}
    >
      {cover && failedImage !== cover ? (
        <Image
          source={{ uri: cover }}
          resizeMode="cover"
          style={styles.cover}
          onError={() => setFailedImage(cover)}
        />
      ) : (
        <View style={[styles.cover, styles.missing]}>
          <MarketIcon name="home" color={theme.accentInk} />
          <Text style={styles.description}>Neighbourhood shop</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name}>{item.name}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
        <View style={styles.bottom}>
          <Text style={styles.metadata}>{metadata}</Text>
          <Text style={styles.metadata}>{actionLabel ?? "View shop ›"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    backgroundColor: theme.surface,
  },
  cover: {
    width: "100%",
    height: 130,

    backgroundColor: theme.canvas,
  },
  missing: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.lime,
  },
  body: { padding: 16 },
  bottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    columnGap: 10,
  },
  name: {
    color: theme.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
  metadata: { marginTop: 8, color: theme.accentInk, fontSize: 12, lineHeight: 17 },
  description: { marginTop: 8, color: theme.muted, fontSize: 12, lineHeight: 17 },
});

import { useInfiniteQuery } from "@tanstack/react-query";
import { shopPagesQuery, type ShopQuery } from "@/services/catalog";
import { useLocationArea } from "@/stores/location";
export function useAreaShopPages(query: ShopQuery = {}) {
  const { area, gps } = useLocationArea();
  const result = useInfiniteQuery(shopPagesQuery({ ...query, area: area?.id, ...gps }));
  return {
    ...result,
    shops: area
      ? [
          ...new Map(
            (result.data?.pages.flatMap((page) => page.items) ?? []).map((shop) => [shop.id, shop]),
          ).values(),
        ]
      : [],
    total: result.data?.pages[0]?.total,
  };
}
export function useAreaShops() {
  return useAreaShopPages().shops;
}

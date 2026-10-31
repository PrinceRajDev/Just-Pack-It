export function unseenOrders(previous: Set<string> | null, ids: string[]) {
  return previous === null ? [] : ids.filter((id) => !previous.has(id));
}

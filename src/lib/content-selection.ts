export function splitCoreIdeaLines(coreIdea: string) {
  return coreIdea
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function selectAllContentItems(items: string[], limit?: number) {
  const scopedItems = typeof limit === "number" ? items.slice(0, limit) : items;
  return scopedItems.filter((item) => item.trim());
}

export function toggleContentItem(selectedItems: string[], item: string) {
  return selectedItems.includes(item)
    ? selectedItems.filter((selectedItem) => selectedItem !== item)
    : [...selectedItems, item];
}

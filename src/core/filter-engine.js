export function normalizeQuery(value = '') { return String(value).trim().toLowerCase(); }
export function filterItems(items, filter = {}) {
  const query = normalizeQuery(filter.query);
  const from = filter.from ? new Date(filter.from).getTime() : null;
  const to = filter.to ? new Date(`${filter.to}T23:59:59.999Z`).getTime() : null;
  return items.filter((item) => {
    const haystack = `${item.title ?? ''}\n${item.body ?? ''}\n${item.url ?? ''}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    const created = item.createdAt ? new Date(item.createdAt).getTime() : null;
    if (from && (!created || created < from)) return false;
    if (to && (!created || created > to)) return false;
    return true;
  });
}

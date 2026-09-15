/** ASCII-folds and collapses everything outside [a-z0-9] into `sep`. */
export function slugify(input: string, sep: "-" | "_", maxLength: number) {
  const folded = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
  let out = folded.slice(0, maxLength)
  while (out.startsWith(sep)) out = out.slice(1)
  while (out.endsWith(sep)) out = out.slice(0, -1)
  return out
}

/** `base`, else `base<sep>2`, `base<sep>3`, … — the first candidate not in `taken`. */
export function nextFreeSlug(base: string, taken: Iterable<string>, sep: "-" | "_") {
  const set = new Set(taken)
  if (!set.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}${sep}${i}`
    if (!set.has(candidate)) return candidate
  }
}

/** Base for a brand slug, e.g. "Mamaearth Pvt. Ltd." → "mamaearth-pvt-ltd". */
export const brandSlugBase = (companyName: string) => slugify(companyName, "-", 60) || "brand"

/** Base for a creator handle (matches the contracts `handle` rule: 3–30 of [a-z0-9_.]); leaves room for a suffix. */
export function creatorHandleBase(name: string, email: string) {
  let base = slugify(name, "_", 24)
  if (base.length < 3) base = slugify(email.split("@")[0] ?? "", "_", 24)
  if (base.length < 3) base = `creator${base ? `_${base}` : ""}`
  return base
}

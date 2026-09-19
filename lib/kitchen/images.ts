/** Only source-owned, same-origin public files. No proxy, hotlink or upload service. */
export function isPublicImagePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 240 &&
    /^\/images\/recipes\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:svg|webp|png|jpe?g)$/.test(value);
}

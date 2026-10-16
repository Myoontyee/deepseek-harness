/** Local thumbnails only; no hot-linked image URLs or original-photo persistence. */
/** Convert an explicitly selected raster image into a bounded local thumbnail.
 * @param file - User-selected raster image.
 * @returns A small local WebP thumbnail.
 */
export async function readAvatar(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error('Choose a PNG, JPEG or WebP under 2 MB / 请选择小于 2 MB 的图片')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64
    const drawing = canvas.getContext('2d')
    if (!drawing) throw new Error('Avatar preview is unavailable')
    const size = Math.min(bitmap.width, bitmap.height)
    drawing.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 64, 64)
    const data = canvas.toDataURL('image/webp', 0.8)
    if (data.length > 48000) throw new Error('Avatar thumbnail is too large')
    return data
  } finally { bitmap.close() }
}

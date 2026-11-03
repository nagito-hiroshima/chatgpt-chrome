export const IMAGE_LIMITS = { count: 8, each: 4 * 1024 * 1024, total: 12 * 1024 * 1024 };
export function validImage(data) {
  return typeof data === 'string' && data.length <= IMAGE_LIMITS.each && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data);
}
export function validImages(images) {
  return Array.isArray(images) && images.length <= IMAGE_LIMITS.count && images.every(validImage) && images.reduce((size, image) => size + image.length, 0) <= IMAGE_LIMITS.total;
}
export function validMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 100) return false;
  let imageCount = 0, imageSize = 0, textSize = 0;
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role)) return false;
    if (typeof message.content === 'string') {
      if (message.content.length > 64000) return false;
      textSize += message.content.length;
    } else {
      if (message.role !== 'user' || !Array.isArray(message.content) || !message.content.length || message.content.length > 16) return false;
      for (const part of message.content) {
        if (part?.type === 'input_text' && typeof part.text === 'string' && part.text.length <= 64000) textSize += part.text.length;
        else if (part?.type === 'input_image' && validImage(part.image_url) && ['auto', 'low', 'high', undefined].includes(part.detail)) { imageCount++; imageSize += part.image_url.length; }
        else return false;
      }
    }
  }
  return imageCount <= IMAGE_LIMITS.count && imageSize <= IMAGE_LIMITS.total && textSize <= 200000 && JSON.stringify(messages).length <= IMAGE_LIMITS.total + 256000;
}

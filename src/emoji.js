// Émojis 3D « Fluent Emoji » (Microsoft, MIT) : fichiers WebP dans emoji/, générés par scripts/fetch-emoji.mjs.
// Ils remplacent les émojis du système, très variables d'une plateforme à l'autre.
const SLUGS = {
  '💪': 'biceps', '🧠': 'brain', '😊': 'smile', '😴': 'sleepy', '⚡': 'zap', '😰': 'anxious', '😌': 'relieved',
  '🎯': 'bullseye', '😔': 'pensive', '🤗': 'hug', '😤': 'steam',
  '🌅': 'sunrise', '☀': 'sun', '🌇': 'sunset', '🌙': 'moon',
  '🌤': 'sun-small-cloud', '⛅': 'sun-cloud', '🌧': 'rain', '⛈': 'storm', '☁': 'cloud',
  '🏠': 'house', '📅': 'calendar', '📊': 'chart', '⚙': 'gear', '🔔': 'bell', '🌈': 'rainbow', '🪟': 'window',
  '🌓': 'halfmoon', '🔒': 'lock', '🛡': 'shield', '✅': 'check', '🤖': 'robot', '🔠': 'abc', '🐢': 'turtle', '📳': 'vibrate', '📤': 'outbox', '📥': 'inbox',
  '🗑': 'trash', '♿': 'wheelchair', '💾': 'floppy', '🎨': 'palette', '✨': 'sparkles'
};

const strip = ch => ch.replace(/️/g, '');

export function emojiSlug(ch) { return SLUGS[strip(ch)] || null; }

/** <img> de l'émoji (ou le caractère lui-même s'il n'a pas d'image). */
export function emojiHTML(ch, size = 28, cls = '') {
  const slug = emojiSlug(ch);
  if (!slug) return ch;
  return `<img class="emo ${cls}" src="emoji/${slug}.webp" data-emoji="${strip(ch)}" alt="" width="${size}" height="${size}" decoding="async" draggable="false">`;
}

/** Remplace le contenu d'un élément par l'émoji 3D. */
export function setEmoji(el, ch, size) {
  const px = size || +el.dataset.size || 28;
  el.innerHTML = emojiHTML(ch, px);
  el.dataset.emoji = strip(ch);
}

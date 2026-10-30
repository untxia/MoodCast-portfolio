// Télécharge les émojis 3D « Fluent Emoji » de Microsoft (licence MIT, github.com/microsoft/fluentui-emoji),
// les réduit à 160 px et les enregistre en WebP dans src/emoji/. À lancer une seule fois : node scripts/fetch-emoji.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'emoji');
const BASE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/';

// slug -> chemin dans le dépôt
const ICONS = {
  biceps: 'Flexed biceps/Default/3D/flexed_biceps_3d_default.png',
  brain: 'Brain/3D/brain_3d.png',
  smile: 'Smiling face with smiling eyes/3D/smiling_face_with_smiling_eyes_3d.png',
  sleepy: 'Sleeping face/3D/sleeping_face_3d.png',
  zap: 'High voltage/3D/high_voltage_3d.png',
  anxious: 'Anxious face with sweat/3D/anxious_face_with_sweat_3d.png',
  relieved: 'Relieved face/3D/relieved_face_3d.png',
  bullseye: 'Bullseye/3D/bullseye_3d.png',
  pensive: 'Pensive face/3D/pensive_face_3d.png',
  hug: 'Hugging face/3D/hugging_face_3d.png',
  steam: 'Face with steam from nose/3D/face_with_steam_from_nose_3d.png',
  sunrise: 'Sunrise/3D/sunrise_3d.png',
  sun: 'Sun/3D/sun_3d.png',
  sunset: 'Sunset/3D/sunset_3d.png',
  moon: 'Crescent moon/3D/crescent_moon_3d.png',
  'sun-small-cloud': 'Sun behind small cloud/3D/sun_behind_small_cloud_3d.png',
  'sun-cloud': 'Sun behind cloud/3D/sun_behind_cloud_3d.png',
  rain: 'Cloud with rain/3D/cloud_with_rain_3d.png',
  storm: 'Cloud with lightning and rain/3D/cloud_with_lightning_and_rain_3d.png',
  house: 'House/3D/house_3d.png',
  calendar: 'Tear-off calendar/3D/tear-off_calendar_3d.png',
  chart: 'Bar chart/3D/bar_chart_3d.png',
  gear: 'Gear/3D/gear_3d.png',
  bell: 'Bell/3D/bell_3d.png',
  rainbow: 'Rainbow/3D/rainbow_3d.png',
  window: 'Window/3D/window_3d.png',
  halfmoon: 'First quarter moon/3D/first_quarter_moon_3d.png',
  abc: 'Input latin uppercase/3D/input_latin_uppercase_3d.png',
  turtle: 'Turtle/3D/turtle_3d.png',
  vibrate: 'Vibration mode/3D/vibration_mode_3d.png',
  outbox: 'Outbox tray/3D/outbox_tray_3d.png',
  inbox: 'Inbox tray/3D/inbox_tray_3d.png',
  trash: 'Wastebasket/3D/wastebasket_3d.png',
  wheelchair: 'Wheelchair symbol/3D/wheelchair_symbol_3d.png',
  floppy: 'Floppy disk/3D/floppy_disk_3d.png',
  palette: 'Artist palette/3D/artist_palette_3d.png',
  sparkles: 'Sparkles/3D/sparkles_3d.png',
  cloud: 'Cloud/3D/cloud_3d.png',
  lock: 'Locked/3D/locked_3d.png',
  shield: 'Shield/3D/shield_3d.png',
  check: 'Check mark button/3D/check_mark_button_3d.png',
  robot: 'Robot/3D/robot_3d.png'
};

await mkdir(out, { recursive: true });
let total = 0;
for (const [slug, repoPath] of Object.entries(ICONS)) {
  const url = BASE + repoPath.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status} (${url})`);
  const webp = await sharp(Buffer.from(await res.arrayBuffer())).resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88, alphaQuality: 100 }).toBuffer();
  await writeFile(path.join(out, slug + '.webp'), webp);
  total += webp.length;
  console.log(slug.padEnd(16), (webp.length / 1024).toFixed(1) + ' Ko');
}
console.log(`\n${Object.keys(ICONS).length} émojis, ${(total / 1024).toFixed(0)} Ko au total`);

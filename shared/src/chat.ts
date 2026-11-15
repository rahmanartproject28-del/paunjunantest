// Penyaring obrolan: sensor kata kasar, hapus tautan & nomor telepon.
const BAD = ['anjing', 'bangsat', 'babi', 'kontol', 'memek', 'goblok', 'tolol', 'bajingan', 'keparat', 'asu', 'jancok', 'kampret', 'ngentot'];
export function cleanChat(s: string): string {
  let t = String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160);
  t = t.replace(/(https?:\/\/|www\.)\S+/gi, '[tautan dihapus]').replace(/\b\S+\.(com|net|id|org|xyz|io|me|co)\b\S*/gi, '[tautan dihapus]');
  t = t.replace(/(\+?\d[\d\s-]{7,}\d)/g, '[nomor dihapus]');
  for (const w of BAD) t = t.replace(new RegExp('\\b' + w + '\\w*', 'gi'), m => m[0] + '*'.repeat(m.length - 1));
  return t;
}
export function cleanName(s: string): string {
  return String(s ?? '').replace(/[^\p{L}\p{N}._ -]/gu, '').trim().slice(0, 18) || 'Pemancing';
}

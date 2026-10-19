/* Shared by the Worker and browser: only built-in character presets are accepted. */
export const APPEARANCE_OPTIONS = Object.freeze({
  skin: Object.freeze(['#edc6a3', '#e4b58b', '#d7a078', '#c48b64', '#ac7555', '#926248']),
  hair: Object.freeze(['#333a33', '#454139', '#554437', '#66513e', '#3a403e']),
  shirt: Object.freeze(['#f4edd7', '#d7e4d7', '#d2dfe5', '#ead9c6', '#dbcfdc', '#e7dbab', '#c8d6cb', '#e4ccbf']),
  bottom: Object.freeze(['#49626b', '#617064', '#7b7364', '#63677c', '#7c666a', '#536962']),
  shoe: Object.freeze(['#444e46', '#5c554a', '#eee6ce', '#495665', '#795e4d', '#726876']),
  accent: Object.freeze(['#b27965', '#76958a', '#c09c65', '#8a7893', '#64838f', '#bc898b']),
  hairType: Object.freeze(['short-side', 'short-crop', 'short-wave', 'short-fringe', 'long', 'long-parted', 'ponytail', 'bob']),
  shirtType: Object.freeze(['plain', 'polo', 'sweater', 'cardigan']),
  bottomType: Object.freeze(['pants', 'pleated', 'straight']),
  faceType: Object.freeze([0, 1, 2, 3]),
  glasses: Object.freeze([false, true]),
});

export const APPEARANCE_FIELDS = Object.freeze([
  { key: 'skin', label: 'Màu da', labels: ['Sáng', 'Be ấm', 'Nâu sáng', 'Nâu ấm', 'Nâu', 'Nâu đậm'], color: true },
  { key: 'faceType', label: 'Khuôn mặt', labels: ['Hiền hòa', 'Thanh tú', 'Bầu bĩnh', 'Thon dài'] },
  { key: 'hairType', label: 'Kiểu tóc', labels: ['Rẽ mái', 'Tóc ngắn', 'Tóc gợn', 'Mái bằng', 'Tóc dài', 'Dài rẽ ngôi', 'Buộc đuôi ngựa', 'Tóc bob'] },
  { key: 'hair', label: 'Màu tóc', labels: ['Đen', 'Nâu đen', 'Nâu', 'Nâu sáng', 'Đen xám'], color: true },
  { key: 'glasses', label: 'Kính', labels: ['Không đeo kính', 'Có đeo kính'] },
  { key: 'shirtType', label: 'Kiểu áo', labels: ['Sơ mi cà vạt', 'Áo polo', 'Áo len', 'Áo cardigan'] },
  { key: 'shirt', label: 'Màu áo', labels: ['Kem', 'Xanh lá nhạt', 'Xanh trời', 'Be', 'Tím nhạt', 'Vàng nhạt', 'Xanh rêu nhạt', 'Hồng đất'], color: true },
  { key: 'bottomType', label: 'Quần / váy', labels: ['Quần dài', 'Váy xếp ly', 'Váy suông'] },
  { key: 'bottom', label: 'Màu quần / váy', labels: ['Xanh than', 'Xanh rêu', 'Nâu xám', 'Xanh tím', 'Nâu hồng', 'Xanh đậm'], color: true },
  { key: 'shoe', label: 'Màu giày', labels: ['Đen', 'Nâu', 'Kem', 'Xanh', 'Nâu da', 'Xám'], color: true },
  { key: 'accent', label: 'Màu phụ kiện', labels: ['Nâu đỏ', 'Xanh ngọc', 'Vàng', 'Tím', 'Xanh lam', 'Hồng'], color: true },
].map(field => Object.freeze({ ...field, labels: Object.freeze(field.labels) })));

export function sanitizeAppearance(value) {
  const safe = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return safe;
  for (const [key, options] of Object.entries(APPEARANCE_OPTIONS)) {
    if (Object.hasOwn(value, key) && options.includes(value[key])) safe[key] = value[key];
  }
  return safe;
}

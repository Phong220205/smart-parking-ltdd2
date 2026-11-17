// ============================================================================
//  UTILS - Hàm tiện ích dùng chung (format, hiển thị)
// ============================================================================

import { SLOT_COLORS } from './constants';

/**
 * Định dạng số theo kiểu Việt Nam (dấu chấm phân tách nghìn).
 * Hermes (RN 0.88) co Intl.NumberFormat, nhung fallback thu cong de app
 * khong bao gio crash neu moi truong khong co Intl.
 */
export function formatNumber(n) {
  const v = Number(n || 0);
  if (!isFinite(v)) return '0';
  try {
    if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
      return new Intl.NumberFormat('vi-VN').format(v);
    }
  } catch { /* Intl khong hoat dong -> dung fallback ben duoi */ }
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Định dạng số tiền kiểu Việt Nam: 6000 -> "6.000đ" */
export const money = (n) => formatNumber(n) + 'đ';

/** Định dạng mốc thời gian */
export const fmtTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '-';
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(d);
    }
  } catch { /* fallback ben duoi */ }
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Màu nền của ô đỗ theo trạng thái + người đang xem */
export const slotColor = (s, mine) => {
  if (s.occupied) return SLOT_COLORS.occupied;
  if (s.reservedBy) return s.reservedBy === mine ? SLOT_COLORS.mine : SLOT_COLORS.reserved;
  return SLOT_COLORS.free;
};

/** Nhãn hiển thị trạng thái ô đỗ */
export const slotLabel = (s, mine) => {
  if (s.occupied) return 'CÓ XE';
  if (s.reservedBy) return s.reservedBy === mine ? 'BẠN ĐẶT' : 'ĐÃ ĐẶT';
  return 'TRỐNG';
};

/**
 * Tính phí giữ xe.
 * @param {number} minutes - số phút xe đã đứng
 * @param {number} feePerHour - đơn giá mỗi giờ
 * @param {number} freeMinutes - số phút miễn phí đầu
 * @returns {number} số tiền (đồng)
 */
export function calcFee(minutes, feePerHour, freeMinutes) {
  const billable = Math.max(0, (minutes || 0) - freeMinutes);
  if (billable <= 0) return 0;
  // Làm tròn lên theo giờ: 31 phút -> 1 giờ, 61 phút -> 2 giờ
  const hours = Math.ceil(billable / 60);
  return hours * feePerHour;
}

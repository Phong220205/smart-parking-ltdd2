// ============================================================================
//  UTILS - Hàm tiện ích dùng chung (format, hiển thị)
// ============================================================================

import { SLOT_COLORS } from './constants';

/** Định dạng số tiền kiểu Việt Nam: 6000 -> "6.000đ" */
export const money = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + 'đ';

/** Định dạng mốc thời gian */
export const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('vi-VN') : '-');

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

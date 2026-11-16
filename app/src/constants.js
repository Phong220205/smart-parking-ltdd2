// ============================================================================
//  CONSTANTS - Hằng số dùng chung toàn App
//  Tách riêng để dễ chỉnh sửa và tránh lặp magic number.
// ============================================================================

/** Số ô đỗ xe của bãi (P1..P6) */
export const SLOT_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

/** Phí giữ xe: 30 phút đầu miễn phí, sau đó tính theo giờ */
export const FEE_PER_HOUR = 3000;
export const FREE_MINUTES = 30;

/** Thời gian giữ chỗ (đơn vị phút) trước khi tự hủy */
export const BOOKING_TIMEOUT_MIN = 5;

/** Timeout chờ phản hồi đặt chỗ (ms) */
export const BOOKING_TIMEOUT_MS = 5000;

/** Các tab trong App */
export const TABS = [
  ['parking', '🅿️ Bãi'],
  ['history', '🧾 Lịch sử'],
  ['stats', '📊 Thống kê'],
  ['account', '👤 Tài khoản'],
];

/** Màu trạng thái ô đỗ */
export const SLOT_COLORS = {
  occupied: '#e74c3c',    // đỏ   - có xe
  mine: '#f1c40f',        // vàng  - mình đang đặt
  reserved: '#e67e22',    // cam   - người khác đặt
  free: '#2ecc71',        // xanh  - trống
};

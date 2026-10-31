// =========================================================================
// PHÒNG KHÁM BÁCH BẢO - BÁO CÁO TELEGRAM & TỰ ĐỘNG XUẤT HĐĐT KIOTVIET
// =========================================================================
// Hướng dẫn cài đặt (chỉ làm 1 lần duy nhất):
// 1. Vào https://script.google.com → Mở dự án hiện tại của Phòng Khám Bách Bảo
// 2. Xóa hết code cũ, dán (paste) toàn bộ nội dung file này vào → Bấm Lưu (Ctrl+S)
// 3. Trên thanh công cụ phía trên, chọn hàm: setupAllTriggers → Bấm nút Run (Chạy)
//    (Hệ thống sẽ tự động cài đặt:
//      - Báo cáo Telegram lúc 20:00 mỗi tối
//      - Tự động quét & xuất Hóa đơn KiotViet mỗi 1 phút cho chi nhánh Thốt Nốt)
// 4. (Tùy chọn để bấm Xuất Ngay 1 giây): Bấm nút "Triển khai" (Deploy) ở góc phải trên
//    → Chọn "Triển khai mới" (New deployment) → Loại: "Ứng dụng web" (Web app)
//    → Quyền truy cập: "Bất kỳ ai" (Anyone) → Bấm Triển khai → Copy URL Web App dán vào App.
// =========================================================================

const FIREBASE_URL = 'https://phongkhambachbao-a47bc-default-rtdb.asia-southeast1.firebasedatabase.app';
const BOT_TOKEN = '8768976912:AAF0_qySQt8QBCv-G6WW1yxp7YhBBLPDEWw';
const CHAT_ID = '-5233383940';

// ==================== CẤU HÌNH KIOTVIET (GIAN HÀNG HKDBACHBAO) ====================
const KIOTVIET_CONFIG = {
  retailer: 'hkdbachbao',
  clientId: '9a5e60b5-ecd9-42b7-b993-e4972e85bd00',
  clientSecret: 'CB762CE80BD5C67B23E2269014EA24DF28B4F96C',
  branchId: 74010,        // Chi nhánh trung tâm
  soldById: 160218,       // Phòng Khám Bách Bảo
  customerId: 34532702,   // KH000001 - Bán cho người tiêu dùng
  productZero: {
    id: 40782588,
    code: 'SP000013',
    name: 'Bs ko tính tiền khám',
    price: 0
  },
  productPaid: {
    id: 33787060,
    code: 'SP000003',
    name: 'Phí khám bệnh và tư vấn 50k',
    price: 50000
  }
};

const BRANCHES = [
  { key: 'nga-bay', name: '🏥 Ngã Bảy' },
  { key: 'thot-not', name: '🏥 Thốt Nốt' }
];

// Helper: chuyển object hoặc mảng về array chuẩn
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

function fmt(n) {
  return (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('vi-VN') + 'k';
}

/** Escape ký tự đặc biệt HTML */
function esc(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =========================================================================
// PHẦN 1: TÍCH HỢP XUẤT HÓA ĐƠN KIOTVIET (CHI NHÁNH THỐT NỐT)
// =========================================================================

/**
 * Lấy Access Token từ KiotViet OAuth2 (Cache 50 phút để tăng tốc độ phản hồi)
 */
function getKiotVietAccessToken(forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    const cachedToken = cache.get('KIOTVIET_ACCESS_TOKEN');
    if (cachedToken) return cachedToken;
  }

  const tokenUrl = 'https://id.kiotviet.vn/connect/token';
  const payload = {
    scopes: 'PublicApi.Access',
    grant_type: 'client_credentials',
    client_id: KIOTVIET_CONFIG.clientId,
    client_secret: KIOTVIET_CONFIG.clientSecret
  };

  const formBody = Object.keys(payload)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]))
    .join('&');

  const res = UrlFetchApp.fetch(tokenUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: formBody,
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code !== 200) {
    throw new Error('Lỗi xác thực KiotViet (' + code + '): ' + text);
  }

  const json = JSON.parse(text);
  if (!json.access_token) {
    throw new Error('Không nhận được access_token từ KiotViet');
  }

  // Lưu cache 50 phút (3000 giây)
  cache.put('KIOTVIET_ACCESS_TOKEN', json.access_token, 3000);
  return json.access_token;
}

/**
 * Tạo hóa đơn trên KiotViet theo quy tắc của Phòng Khám Bách Bảo:
 * - Toa 0 đồng: Xuất mã SP000013 (0đ)
 * - Tất cả toa giá khác (> 0đ): Xuất mã SP000003 (giữ nguyên giá mặc định 50.000đ)
 * - Mặc định Tiền mặt (Cash), khách hàng KH000001 (Bán cho người tiêu dùng)
 * - Ghi kèm Tên bé vào phần Ghi chú (description), không ghi STT toa
 */
function createKiotVietInvoiceForRx(rxData) {
  const token = getKiotVietAccessToken(false);
  const rawPrice = parseFloat(rxData.price || 0);
  const isZeroPrice = isNaN(rawPrice) || rawPrice <= 0;

  const selectedProduct = isZeroPrice ? KIOTVIET_CONFIG.productZero : KIOTVIET_CONFIG.productPaid;
  const invoiceAmount = selectedProduct.price; // 0 hoặc 50000
  const patientName = String(rxData.name || '').trim();

  const invoicePayload = {
    branchId: KIOTVIET_CONFIG.branchId,
    soldById: KIOTVIET_CONFIG.soldById,
    customerId: KIOTVIET_CONFIG.customerId,
    totalPayment: invoiceAmount,
    discount: 0,
    description: patientName,
    makeInvoice: true,
    invoiceDetails: [
      {
        productId: selectedProduct.id,
        productCode: selectedProduct.code,
        productName: selectedProduct.name,
        quantity: 1,
        price: invoiceAmount,
        discount: 0
      }
    ],
    payments: [
      {
        method: 'Cash',
        amount: invoiceAmount
      }
    ]
  };

  const res = UrlFetchApp.fetch('https://public.kiotapi.com/invoices', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Retailer: KIOTVIET_CONFIG.retailer
    },
    payload: JSON.stringify(invoicePayload),
    muteHttpExceptions: true
  });

  const statusCode = res.getResponseCode();
  const respText = res.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('KiotViet API Error (' + statusCode + '): ' + respText);
  }

  const data = JSON.parse(respText);
  return {
    id: data.id || '',
    code: data.code || '',
    eInvoiceStatus: data.eInvoiceStatus || (isZeroPrice ? 'Chưa phát hành' : 'Đã phát hành'),
    productCode: selectedProduct.code,
    invoiceAmount: invoiceAmount
  };
}

/**
 * Quét hàng đợi kiotviet_queue_v2 trên Firebase và xuất hóa đơn cho các toa đã tới hạn (hoặc bấm Xuất ngay)
 */
function processKiotVietQueue(targetQueueKey) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: 'locked', message: 'Đang có tiến trình khác xử lý hàng đợi' };
  }

  try {
    const now = Date.now();

    // Cập nhật nhịp tim (heartbeat) và tự động đồng bộ Web App URL lên Firebase
    try {
      const heartbeatPayload = { lastHeartbeat: now, updatedAt: new Date().toISOString() };
      try {
        const serviceUrl = ScriptApp.getService().getUrl();
        if (serviceUrl && serviceUrl.indexOf('https://script.google.com') === 0) {
          heartbeatPayload.webhookUrl = serviceUrl;
        }
      } catch (eUrl) {}
      UrlFetchApp.fetch(FIREBASE_URL + '/settings_v2/kiotvietWorker.json', {
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify(heartbeatPayload),
        muteHttpExceptions: true
      });
    } catch (hbErr) {}

    // Đọc danh sách hàng đợi từ Firebase
    const qRes = UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2.json', { muteHttpExceptions: true });
    if (qRes.getResponseCode() !== 200) return { processed: 0 };

    const queueObj = JSON.parse(qRes.getContentText());
    if (!queueObj || typeof queueObj !== 'object') return { processed: 0 };

    const entries = Object.entries(queueObj);
    let processedCount = 0;
    const results = [];

    for (let i = 0; i < entries.length; i++) {
      const [queueKey, item] = entries[i];
      if (!item || typeof item !== 'object') continue;
      if (targetQueueKey && queueKey !== targetQueueKey) continue;

      const branch = item.branch || 'thot-not';
      // Chỉ xuất cho chi nhánh Thốt Nốt
      if (branch !== 'thot-not') {
        UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
          method: 'delete',
          muteHttpExceptions: true
        });
        continue;
      }

      const isImmediate = item.status === 'immediate';
      const scheduledAt = parseFloat(item.scheduledAt || 0);
      const isDue = isImmediate || (item.status === 'scheduled' && now >= scheduledAt);

      if (!isDue && !targetQueueKey) {
        continue; // Chưa tới thời điểm 15 phút
      }

      const dateKey = String(item.dateKey || '').trim();
      const rxId = String(item.rxId || '').trim();
      if (!dateKey || !rxId) {
        UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
          method: 'delete',
          muteHttpExceptions: true
        });
        continue;
      }

      // 1. Kiểm tra trạng thái hiện tại trong kiotviet_ByDate_v2 để chống xuất trùng
      const statusUrl = FIREBASE_URL + '/kiotviet_ByDate_v2/thot-not/' + dateKey + '/' + encodeURIComponent(rxId) + '.json';
      const curStatusRes = UrlFetchApp.fetch(statusUrl, { muteHttpExceptions: true });
      const curStatusObj = curStatusRes.getResponseCode() === 200 ? JSON.parse(curStatusRes.getContentText()) : null;

      if (curStatusObj && curStatusObj.kiotStatus === 'issued' && curStatusObj.kiotInvoiceCode) {
        // Toa này đã được xuất rồi -> Xóa khỏi hàng đợi
        UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
          method: 'delete',
          muteHttpExceptions: true
        });
        continue;
      }

      if (!targetQueueKey && curStatusObj && curStatusObj.kiotStatus === 'cancelled') {
        // Nhân viên đã bấm hủy hẹn giờ -> Xóa khỏi hàng đợi
        UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
          method: 'delete',
          muteHttpExceptions: true
        });
        continue;
      }

      // 2. Lấy dữ liệu toa mới nhất từ daily_v2/thot-not/{dateKey} (phòng trường hợp nhân viên sửa tên bé / giá tiền hoặc xóa toa trong 15 phút chờ)
      let latestName = item.name !== undefined ? String(item.name).trim() : '';
      let latestPrice = item.price !== undefined ? item.price : 0;
      let latestStt = item.prescriptionNo || '';
      let dailyData = null;

      try {
        const dailyRes = UrlFetchApp.fetch(FIREBASE_URL + '/daily_v2/thot-not/' + dateKey + '.json', { muteHttpExceptions: true });
        if (dailyRes.getResponseCode() === 200) {
          dailyData = JSON.parse(dailyRes.getContentText());
        }
      } catch (eDaily) {}

      if (dailyData && dailyData.prescriptions) {
        const rxList = toArray(dailyData.prescriptions).filter(Boolean);
        const matchedRx = rxList.find(p => p && (p.id === rxId || (latestStt && String(p.prescriptionNo || '').trim() === String(latestStt).trim())));
        if (!matchedRx && !isImmediate) {
          // Nếu là lệnh hẹn 15 phút mà toa đã bị nhân viên xóa khỏi danh sách -> Hủy không xuất!
          UrlFetchApp.fetch(statusUrl, {
            method: 'patch',
            contentType: 'application/json',
            payload: JSON.stringify({
              kiotStatus: 'cancelled',
              kiotError: 'Toa đã bị xóa trước khi xuất',
              updatedAt: new Date().toISOString()
            }),
            muteHttpExceptions: true
          });
          UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
            method: 'delete',
            muteHttpExceptions: true
          });
          continue;
        }
        if (matchedRx) {
          if (matchedRx.kiotStatus === 'issued' && matchedRx.kiotInvoiceCode) {
            UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
              method: 'delete',
              muteHttpExceptions: true
            });
            continue;
          }
          latestName = String(matchedRx.name || '').trim();
          latestPrice = matchedRx.price !== undefined && matchedRx.price !== '' ? matchedRx.price : 0;
          latestStt = matchedRx.prescriptionNo || latestStt;
        }
      }

      // 3. Đánh dấu đang xử lý (processing)
      UrlFetchApp.fetch(statusUrl, {
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify({
          rxId: rxId,
          prescriptionNo: latestStt,
          name: latestName,
          price: latestPrice,
          kiotStatus: 'processing',
          updatedAt: new Date().toISOString()
        }),
        muteHttpExceptions: true
      });

      // 4. Gọi KiotViet API để tạo hóa đơn
      try {
        const invResult = createKiotVietInvoiceForRx({
          prescriptionNo: latestStt,
          name: latestName,
          price: latestPrice
        });

        const issuedIso = new Date().toISOString();
        const issuedBy = item.requestedBy || (isImmediate ? 'Nhân viên' : 'Tự động (15p)');

        const successRecord = {
          rxId: rxId,
          prescriptionNo: latestStt,
          name: latestName,
          price: latestPrice,
          kiotStatus: 'issued',
          kiotInvoiceCode: invResult.code,
          kiotInvoiceId: invResult.id,
          kiotProductCode: invResult.productCode,
          kiotInvoiceAmount: invResult.invoiceAmount,
          kiotEInvoiceStatus: invResult.eInvoiceStatus,
          kiotIssuedAt: issuedIso,
          kiotIssuedBy: issuedBy,
          kiotError: '',
          updatedAt: issuedIso
        };

        // Lưu kết quả vào node chuyên biệt kiotviet_ByDate_v2
        UrlFetchApp.fetch(statusUrl, {
          method: 'put',
          contentType: 'application/json',
          payload: JSON.stringify(successRecord),
          muteHttpExceptions: true
        });

        // Đồng bộ vào mảng prescriptions của daily_v2 nếu có
        if (dailyData && Array.isArray(dailyData.prescriptions)) {
          const updatedPrescriptions = dailyData.prescriptions.map(p => {
            if (p && p.id === rxId) {
              return Object.assign({}, p, {
                kiotStatus: 'issued',
                kiotInvoiceCode: invResult.code,
                kiotInvoiceId: invResult.id,
                kiotProductCode: invResult.productCode,
                kiotIssuedAt: issuedIso,
                kiotIssuedBy: issuedBy,
                kiotError: ''
              });
            }
            return p;
          });
          UrlFetchApp.fetch(FIREBASE_URL + '/daily_v2/thot-not/' + dateKey + '/prescriptions.json', {
            method: 'put',
            contentType: 'application/json',
            payload: JSON.stringify(updatedPrescriptions),
            muteHttpExceptions: true
          });
        }

        // Xóa khỏi hàng đợi sau khi xuất thành công
        UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
          method: 'delete',
          muteHttpExceptions: true
        });

        processedCount++;
        results.push({ rxId: rxId, code: invResult.code, status: 'issued' });
      } catch (apiErr) {
        const errMsg = String(apiErr && apiErr.message ? apiErr.message : apiErr);
        UrlFetchApp.fetch(statusUrl, {
          method: 'patch',
          contentType: 'application/json',
          payload: JSON.stringify({
            rxId: rxId,
            prescriptionNo: latestStt,
            name: latestName,
            price: latestPrice,
            kiotStatus: 'error',
            kiotError: errMsg.substring(0, 220),
            updatedAt: new Date().toISOString()
          }),
          muteHttpExceptions: true
        });

        // Xóa khỏi queue để không bị lặp lỗi liên tục (nhân viên có thể bấm Xuất lại)
        UrlFetchApp.fetch(FIREBASE_URL + '/kiotviet_queue_v2/' + encodeURIComponent(queueKey) + '.json', {
          method: 'delete',
          muteHttpExceptions: true
        });

        results.push({ rxId: rxId, error: errMsg, status: 'error' });
      }
    }

    return { status: 'ok', processed: processedCount, results: results };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Webhook nhận lệnh tức thì từ Web App (khi bấm "Xuất HĐ ngay")
 */
function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    if (body.action === 'testConnection') {
      const token = getKiotVietAccessToken(true);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'ok',
        message: 'Kết nối KiotViet (hkdbachbao) thành công!',
        tokenLength: token ? token.length : 0
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const targetKey = body.queueKey || null;
    const res = processKiotVietQueue(targetKey);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: String(err && err.message ? err.message : err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'process';
    if (action === 'test') {
      const token = getKiotVietAccessToken(true);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'ok',
        retailer: KIOTVIET_CONFIG.retailer,
        tokenReady: !!token
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const queueKey = (e && e.parameter && e.parameter.queueKey) || null;
    const res = processKiotVietQueue(queueKey);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: String(err && err.message ? err.message : err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================================
// PHẦN 2: BÁO CÁO DOANH THU TỰ ĐỘNG QUA TELEGRAM (20:00 MỖI TỐI)
// =========================================================================

function sendDailyReport() {
  try {
    const today = new Date();
    const dateKey = Utilities.formatDate(today, 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
    const dateDisplay = Utilities.formatDate(today, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');

    let msg = '📊 <b>BÁO CÁO DOANH THU</b>\n';
    msg += '📅 Ngày: <b>' + dateDisplay + '</b>\n';
    msg += '━━━━━━━━━━━━━━━━━━━━\n';

    // 1. Tải dữ liệu 2 chi nhánh từ Firebase
    const branchesData = [];
    for (const b of BRANCHES) {
      let bData = null;
      try {
        const res = UrlFetchApp.fetch(FIREBASE_URL + '/daily_v2/' + b.key + '/' + dateKey + '.json', { muteHttpExceptions: true });
        if (res.getResponseCode() === 200) {
          bData = JSON.parse(res.getContentText());
        }
      } catch (err) {
        console.error('Fetch error ' + b.key + ':', err);
      }
      branchesData.push({ key: b.key, name: b.name, data: bData });
    }

    // 2. Tính tổng tiền nhập thuốc của Ngã Bảy từ Thốt Nốt (sổ sách cuối tháng)
    let ngaBayMedicine = 0;
    const nbItem = branchesData.find(b => b.key === 'nga-bay');
    if (nbItem && nbItem.data) {
      const nbMeds = toArray(nbItem.data.medicines).filter(Boolean);
      nbMeds.forEach(m => {
        ngaBayMedicine += parseFloat(m.quantity || 0) * parseFloat(m.price || 0);
      });
    }

    let gExam = 0, gExamCash = 0, gExamTransfer = 0, gCases = 0;
    let gDoctor = 0, gExpense = 0, gMedicine = 0;
    let gNet = 0, gNetCash = 0, gNetTransfer = 0;
    let hasData = false;

    // 3. Xử lý từng chi nhánh
    for (const { key, name, data } of branchesData) {
      if (!data || (!data.examinations && !data.prescriptions && !data.doctorFees && !data.expenses && !data.medicines)) {
        msg += '\n' + name + ': 📭 Chưa có dữ liệu\n';
        continue;
      }
      hasData = true;

      const isThotNot = (key === 'thot-not');
      const isNgaBay = (key === 'nga-bay');

      let exam = 0, examCash = 0, examTransfer = 0, cases = 0;
      const transferPrescriptions = [];

      const rxList = toArray(data.prescriptions).filter(Boolean);
      if (rxList.length > 0) {
        rxList.forEach(p => {
          const price = parseFloat(p.price || 0);
          exam += price;
          cases++;
          if (p.paymentMethod === 'transfer') {
            examTransfer += price;
            if (p.prescriptionNo) {
              transferPrescriptions.push('Toa ' + String(p.prescriptionNo).trim());
            }
          } else {
            examCash += price;
          }
        });
      } else if (data.examinations) {
        Object.entries(data.examinations || {}).forEach(([p, c]) => {
          if (c && parseFloat(c) > 0) {
            exam += parseFloat(p) * parseFloat(c);
            cases += parseInt(c);
          }
        });
        if (data.patientDetails) {
          Object.entries(data.patientDetails).forEach(([p, patients]) => {
            const ptList = toArray(patients).filter(Boolean);
            ptList.forEach(pt => {
              if (pt && pt.paymentMethod === 'transfer') {
                examTransfer += parseFloat(p || 0);
                if (pt.prescriptionNo) {
                  transferPrescriptions.push('Toa ' + String(pt.prescriptionNo).trim());
                }
              }
            });
          });
        }
        examCash = exam - examTransfer;
      }

      // Sắp xếp số toa chuyển khoản tăng dần
      transferPrescriptions.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
        return numA - numB;
      });

      let doctor = 0, expense = 0, medicine = 0;
      const docList = toArray(data.doctorFees).filter(Boolean);
      docList.forEach(f => doctor += parseFloat(f.amount || 0));

      const expList = toArray(data.expenses).filter(Boolean);
      expList.forEach(e => expense += parseFloat(e.amount || 0));

      const medList = toArray(data.medicines).filter(Boolean);
      medList.forEach(m => medicine += parseFloat(m.quantity || 0) * parseFloat(m.price || 0));

      const transferredFromNB = isThotNot ? ngaBayMedicine : 0;

      // Tiền mặt và Chuyển khoản:
      let netCash = 0, netTransfer = examTransfer;
      let dailyTotalInDay = 0;
      let grandTotal = 0;

      if (isNgaBay) {
        netCash = examCash - doctor - expense - medicine;
        dailyTotalInDay = netCash + netTransfer;
        grandTotal = dailyTotalInDay;
      } else if (isThotNot) {
        netCash = examCash - doctor - expense - medicine;
        dailyTotalInDay = netCash + netTransfer;
        grandTotal = dailyTotalInDay + transferredFromNB;
      } else {
        netCash = examCash - doctor - expense;
        dailyTotalInDay = netCash + netTransfer;
        grandTotal = dailyTotalInDay;
      }

      msg += '\n' + name + '\n';
      msg += '💰 Tiền khám: <b>' + fmt(exam) + '</b> (' + cases + ' ca)\n';

      const ckNote = transferPrescriptions.length > 0 ? ' (' + transferPrescriptions.join(', ') + ')' : '';
      msg += '   💵 Tiền mặt: ' + fmt(examCash) + ' | 💳 Chuyển khoản: ' + fmt(examTransfer) + ckNote + '\n';

      msg += '👨‍⚕️ Lương BS: ' + fmt(doctor) + '\n';
      msg += '💸 Chi phí: ' + fmt(expense) + '\n';

      if (isNgaBay && medicine > 0) {
        msg += '💊 Tiền nhập thuốc từ Thốt Nốt: -' + fmt(medicine) + ' (sổ sách cuối tháng)\n';
        msg += (dailyTotalInDay >= 0 ? '✅' : '🔴') + ' Còn lại trong ngày: <b>' + fmt(dailyTotalInDay) + '</b>\n';
        msg += '   💵 Tiền mặt: ' + fmt(netCash) + ' | 💳 Chuyển khoản: ' + fmt(netTransfer) + '\n';
      } else if (isThotNot) {
        if (medicine > 0) {
          msg += '💊 Tiền thuốc tại quầy Thốt Nốt: ' + fmt(medicine) + '\n';
        }
        msg += (dailyTotalInDay >= 0 ? '✅' : '🔴') + ' Còn lại trong ngày: <b>' + fmt(dailyTotalInDay) + '</b>\n';
        msg += '   💵 Tiền mặt: ' + fmt(netCash) + ' | 💳 Chuyển khoản: ' + fmt(netTransfer) + '\n';
        if (transferredFromNB > 0) {
          msg += '📦 Tiền bán thuốc cho Ngã Bảy (sổ sách): +' + fmt(transferredFromNB) + '\n';
          msg += '👉 Tổng gồm thuốc (sổ sách): <b>' + fmt(grandTotal) + '</b>\n';
        }
      } else {
        msg += (dailyTotalInDay >= 0 ? '✅' : '🔴') + ' Còn lại trong ngày: <b>' + fmt(dailyTotalInDay) + '</b>\n';
        msg += '   💵 Tiền mặt: ' + fmt(netCash) + ' | 💳 Chuyển khoản: ' + fmt(netTransfer) + '\n';
      }

      if (docList.length > 0) {
        const details = docList.filter(f => f && f.doctor && parseFloat(f.amount) > 0).map(f => esc(f.doctor) + ' ' + fmt(parseFloat(f.amount)));
        if (details.length) msg += '   ┗ Lương BS: ' + details.join(', ') + '\n';
      }
      if (expList.length > 0) {
        const details = expList.filter(e => e && e.description && parseFloat(e.amount) > 0).map(e => esc(e.description) + ' ' + fmt(parseFloat(e.amount)));
        if (details.length) msg += '   ┗ Chi phí: ' + details.join(', ') + '\n';
      }

      gExam += exam;
      gExamCash += examCash;
      gExamTransfer += examTransfer;
      gDoctor += doctor;
      gExpense += expense;
      gMedicine += medicine;
      gCases += cases;
      gNet += grandTotal;
      gNetCash += netCash;
      gNetTransfer += netTransfer;
    }

    if (hasData && branchesData.length > 1) {
      msg += '\n━━━━━━━━━━━━━━━━━━━━\n';
      msg += '📈 <b>TỔNG 2 CHI NHÁNH</b>\n';
      msg += '💰 Tiền khám: <b>' + fmt(gExam) + '</b> (' + gCases + ' ca)\n';
      msg += '   💵 Tiền mặt: ' + fmt(gExamCash) + ' | 💳 Chuyển khoản: ' + fmt(gExamTransfer) + '\n';
      if (ngaBayMedicine > 0) {
        msg += '💊 Tiền thuốc: Huề (NB trả TN ' + fmt(ngaBayMedicine) + ' trên sổ sách)\n';
      }
      msg += '👨‍⚕️ Lương BS: ' + fmt(gDoctor) + '\n';
      msg += '💸 Chi phí: ' + fmt(gExpense) + '\n';
      msg += '━━━━━━━━━━━━━━━━━━━━\n';
      msg += (gNet >= 0 ? '🏆' : '🔴') + ' <b>TỔNG CÒN LẠI: ' + fmt(gNet) + '</b>\n';
      msg += '   💵 Tiền mặt trong ngày: <b>' + fmt(gNetCash) + '</b> | 💳 Chuyển khoản: <b>' + fmt(gNetTransfer) + '</b>\n';
      if (ngaBayMedicine > 0) {
        msg += '   📦 Tiền thuốc trên sổ sách: <b>' + fmt(ngaBayMedicine) + '</b>\n';
      }
    }

    const now = new Date();
    msg += '\n🕗 ' + Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'HH:mm dd/MM/yyyy');
    msg += '\n🤖 <i>Báo cáo tự động PKBB</i>';

    sendTG(msg);
  } catch (e) {
    sendTG('❌ Lỗi báo cáo PKBB: ' + esc(e.message));
  }
}

// ==================== TIỆN ÍCH GỬI TELEGRAM ====================

function sendTG(text) {
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: CHAT_ID, text: text, parse_mode: 'HTML' })
  });
}

// ==================== CÀI ĐẶT TRIGGER TỰ ĐỘNG ====================

/**
 * CHẠY HÀM NÀY 1 LẦN DUY NHẤT ĐỂ BẬT ĐỒNG THỜI:
 * 1. Tự động quét & xuất Hóa đơn KiotViet mỗi 1 phút (sau 15p in bill hoặc khi bấm Xuất ngay)
 * 2. Báo cáo doanh thu Telegram tự động lúc 20:00 mỗi tối
 */
function setupAllTriggers() {
  // Xóa các trigger cũ để tránh trùng lặp
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'sendDailyReport' || fn === 'processKiotVietQueue') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 1. Trigger báo cáo Telegram 20:00 mỗi ngày
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .atHour(20)
    .everyDays(1)
    .inTimezone('Asia/Ho_Chi_Minh')
    .create();

  // 2. Trigger quét hàng đợi xuất hóa đơn KiotViet mỗi 1 phút
  ScriptApp.newTrigger('processKiotVietQueue')
    .timeBased()
    .everyMinutes(1)
    .create();

  // Kiểm tra kết nối KiotViet ngay lập tức và cập nhật nhịp tim lên Firebase
  const token = getKiotVietAccessToken(true);
  processKiotVietQueue();

  sendTG(
    '✅ <b>Đã kích hoạt Hệ thống Tự động PKBB!</b>\n' +
    '🧾 <b>KiotViet HĐĐT (hkdbachbao - Thốt Nốt):</b> Tự động quét & xuất hóa đơn mỗi phút (Token OK: ' + (token ? '✔️' : '❌') + ')\n' +
    '📊 <b>Báo cáo doanh thu Telegram:</b> Tự động gửi lúc 20:00 mỗi tối'
  );
}

/** Giữ tên hàm cũ để tương thích ngược */
function setupDailyTrigger() {
  setupAllTriggers();
}

/** Test thử gửi báo cáo Telegram ngay lập tức */
function testSendReport() {
  sendDailyReport();
}

/** Test thử quét hàng đợi KiotViet ngay lập tức */
function testKiotVietQueue() {
  const res = processKiotVietQueue();
  Logger.log(JSON.stringify(res));
}

// =============================================================
// PHÒNG KHÁM BÁCH BẢO - BÁO CÁO DOANH THU TỰ ĐỘNG QUA TELEGRAM
// =============================================================
// Hướng dẫn cập nhật:
// 1. Vào https://script.google.com → Mở dự án báo cáo Telegram hiện tại
// 2. Xóa hết code cũ, dán (paste) toàn bộ nội dung file này vào → Bấm Lưu (Ctrl+S)
// 3. Chọn hàm testSendReport() → Bấm Run (Chạy) để kiểm tra gửi báo cáo ngay
// 4. Báo cáo tự động sẽ gửi lúc 20:00 mỗi tối, tách bạch rõ ràng Tiền mặt và Chuyển khoản!
// =============================================================

const FIREBASE_URL = 'https://phongkhambachbao-a47bc-default-rtdb.asia-southeast1.firebasedatabase.app';
const BOT_TOKEN = '8768976912:AAF0_qySQt8QBCv-G6WW1yxp7YhBBLPDEWw';
const CHAT_ID = '-5233383940';

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

// ==================== HÀM CHÍNH ====================

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
        // Ngã Bảy: trừ tiền nhập thuốc từ TN vào tiền mặt NB (nộp lại cho TN trên sổ sách)
        netCash = examCash - doctor - expense - medicine;
        dailyTotalInDay = netCash + netTransfer;
        grandTotal = dailyTotalInDay;
      } else if (isThotNot) {
        // Thốt Nốt: Tiền mặt trong ngày chỉ tính thu chi thực tế tại TN (chưa bao gồm tiền bán thuốc cho NB)
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

      // Phần chuyển khoản chỉ ghi số toa, không ghi tên bệnh nhân
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

      // Chi tiết Lương BS và Chi phí (không ghi tên bệnh nhân, không chi tiết từng loại thuốc)
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

/** Chạy hàm này 1 LẦN để bật tự động 20h tối mỗi ngày */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendDailyReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyReport').timeBased().atHour(20).everyDays(1).inTimezone('Asia/Ho_Chi_Minh').create();
  sendTG('✅ Đã bật báo cáo tự động PKBB!\n📅 Gửi lúc 20:00 tối mỗi ngày');
}

/** Test thử gửi báo cáo ngay lập tức */
function testSendReport() {
  sendDailyReport();
}

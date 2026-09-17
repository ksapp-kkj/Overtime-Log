// ====== 基本設定 ======
const BASE_WORK_MINUTES = 7 * 60 + 50;
const REST_PERIODS = [
  { start: 10 * 60, end: 10 * 60 + 10 },
  { start: 12 * 60, end: 12 * 60 + 50 },
  { start: 15 * 60, end: 15 * 60 + 10 }
];

let workData = JSON.parse(localStorage.getItem('workData')) || {};
let currentDisplayDate = new Date();
let monthStartDay = parseInt(localStorage.getItem('monthStartDay'), 10) || 21;


// ====== ユーティリティ関数 ======
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToDisplay(totalMinutes) {
  const isNegative = totalMinutes < 0;
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const sign = isNegative ? "-" : (totalMinutes > 0 ? "+" : "");
  return `${sign}${hours}時間${mins}分`;
}

function parseOvertimeString(str) {
  if (!str) return 0;
  const isNegative = str.startsWith('-');
  const match = str.match(/(\d+)時間(\d+)分/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const total = hours * 60 + mins;
    return isNegative ? -total : total;
  }
  return 0;
}


// ====== メイン表示＆集計ロジック ======

function updateCurrentMonthDisplay() {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  let date = today.getDate();
  let dayIndex = today.getDay();

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  document.getElementById('today-date').textContent = `${year}年${month}月${date}日(${weekdays[dayIndex]})`;

  if (!document.getElementById('work-date').value) {
    const mStr = String(month).padStart(2, '0');
    const dStr = String(date).padStart(2, '0');
    document.getElementById('work-date').value = `${year}-${mStr}-${dStr}`;
  }

  let targetYear = year;
  let targetMonth = month;
  let startMonth = month; 
  let startDateObj, endDateObj;

  if (monthStartDay === 1) {
    document.getElementById('current-month').textContent = `${year}年${month}月度`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    document.getElementById('current-period').textContent = `${month}/1〜${month}/${lastDayOfMonth}`;
    startDateObj = new Date(year, month - 1, 1);
    endDateObj = new Date(year, month, 0);
  } else {
    if (date >= monthStartDay) {
      targetMonth += 1;
      if (targetMonth > 12) {
        targetMonth = 1;
        targetYear += 1;
      }
      startMonth = targetMonth - 1;
      startDateObj = new Date(year, month - 1, monthStartDay);
      endDateObj = new Date(year, month, monthStartDay - 1);
    } else {
      startMonth = targetMonth - 1;
      if (startMonth === 0) {
        startMonth = 12;
      }
      startDateObj = new Date(year, month - 2, monthStartDay);
      endDateObj = new Date(year, month - 1, monthStartDay - 1);
    }

    let endDay = monthStartDay - 1;
    document.getElementById('current-month').textContent = `${targetYear}年${targetMonth}月度`;
    document.getElementById('current-period').textContent = `${startMonth}/${monthStartDay}〜${targetMonth}/${endDay}`;
  }

  let totalOvertimeMins = 0;
  for (const dateStr in workData) {
    const workDate = new Date(dateStr);
    workDate.setHours(0, 0, 0, 0);
    startDateObj.setHours(0, 0, 0, 0);
    endDateObj.setHours(0, 0, 0, 0);
    
    if (workDate >= startDateObj && workDate <= endDateObj) {
      const data = workData[dateStr];
      if (data.overtimeMins !== undefined) {
        totalOvertimeMins += data.overtimeMins;
      } else {
        totalOvertimeMins += parseOvertimeString(data.overtime);
      }
    }
  }

  document.getElementById('total-overtime').textContent = minutesToDisplay(totalOvertimeMins);
}


// ====== 入力・編集の共通計算ロジック ======
function calculateWorkData(startTimeVal, endTimeVal) {
  const rawStartMins = timeToMinutes(startTimeVal);
  const rawEndMins = timeToMinutes(endTimeVal);
  const startMins = Math.ceil(rawStartMins / 10) * 10;
  const endMins = Math.floor(rawEndMins / 10) * 10;

  if (endMins <= startMins) {
    alert("退勤時間は出勤時間より後に設定してください");
    return null;
  }

  let totalRestMins = 0;
  REST_PERIODS.forEach(rest => {
    const overlapStart = Math.max(startMins, rest.start);
    const overlapEnd = Math.min(endMins, rest.end);
    if (overlapEnd > overlapStart) {
      totalRestMins += (overlapEnd - overlapStart);
    }
  });

  const grossWorkMins = endMins - startMins; 
  const actualWorkMins = grossWorkMins - totalRestMins; 
  const overtimeMins = actualWorkMins - BASE_WORK_MINUTES; 

  return {
    start: startTimeVal,
    end: endTimeVal,
    actual: minutesToDisplay(actualWorkMins),
    overtime: minutesToDisplay(overtimeMins),
    overtimeMins: overtimeMins 
  };
}


// ====== 新規登録処理 ======
document.getElementById('work-form').addEventListener('submit', function(event) {
  event.preventDefault();

  const dateVal = document.getElementById('work-date').value;
  const startTimeVal = document.getElementById('start-time').value;
  const endTimeVal = document.getElementById('end-time').value;

  if (!dateVal) return;

  const newData = calculateWorkData(startTimeVal, endTimeVal);
  if (!newData) return; // エラー時は処理中断

  workData[dateVal] = newData;
  localStorage.setItem('workData', JSON.stringify(workData));

  currentDisplayDate = new Date(dateVal);
  renderCalendar();
  updateCurrentMonthDisplay(); 
  alert("登録しました！");
});


// ====== カレンダー関連 ======
function renderCalendar() {
  const year = currentDisplayDate.getFullYear();
  const month = currentDisplayDate.getMonth();

  document.getElementById('calendar-title').textContent = `${year}年${month + 1}月`;
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const grid = document.querySelector('.calendar-grid');
  
  // ★ 変更：スマホで隠すために weekday-header クラスを追加
  grid.innerHTML = `
    <div class="weekday weekday-header">日</div><div class="weekday weekday-header">月</div>
    <div class="weekday weekday-header">火</div><div class="weekday weekday-header">水</div>
    <div class="weekday weekday-header">木</div><div class="weekday weekday-header">金</div><div class="weekday weekday-header">土</div>
  `;

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.classList.add('calendar-day', 'empty');
    grid.appendChild(emptyDiv);
  }

  // 曜日を計算するための配列
  const weekdaysArr = ["日", "月", "火", "水", "木", "金", "土"];

  for (let i = 1; i <= lastDate; i++) {
    const dayDiv = document.createElement('div');
    dayDiv.classList.add('calendar-day');
    
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(i).padStart(2, '0');
    const fullDateStr = `${year}-${monthStr}-${dayStr}`;

    // その日の曜日を計算
    const currentDayIndex = (firstDayIndex + i - 1) % 7;
    const dayOfWeekStr = weekdaysArr[currentDayIndex];

    // ★ 変更：スマホ用の曜日テキスト（mobile-weekday）を仕込んでおく
    dayDiv.innerHTML = `<div class="date-number">${i} <span class="mobile-weekday">(${dayOfWeekStr})</span></div>`;
    
    if (workData[fullDateStr]) {
      dayDiv.classList.add('has-data');
      dayDiv.innerHTML += `<div class="overtime-display">${workData[fullDateStr].overtime}</div>`;
      
      dayDiv.addEventListener('click', function() {
        openEditModal(fullDateStr);
      });
    }
    grid.appendChild(dayDiv);
  }
}

document.getElementById('prev-month').addEventListener('click', () => {
  currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
  renderCalendar();
});


// ====== メニュー＆設定関連 ======
const menuBtn = document.getElementById('menu-btn');
const sideMenu = document.getElementById('side-menu');
const openSettingsBtn = document.getElementById('open-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');

menuBtn.addEventListener('click', () => {
  sideMenu.classList.toggle('hidden');
});

openSettingsBtn.addEventListener('click', (e) => {
  e.preventDefault();
  sideMenu.classList.add('hidden');
  document.getElementById('start-day-setting').value = monthStartDay;
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
  const newStartDay = parseInt(document.getElementById('start-day-setting').value, 10);
  if (newStartDay >= 1 && newStartDay <= 31) {
    monthStartDay = newStartDay;
    localStorage.setItem('monthStartDay', monthStartDay);
    updateCurrentMonthDisplay(); 
    settingsModal.classList.add('hidden');
    alert(`月度の開始日を「${monthStartDay}日」に変更しました。`);
  } else {
    alert("1〜31の数字を入力してください。");
  }
});


// ====== ★新規：編集・削除関連 ======
const editModal = document.getElementById('edit-modal');
const closeEditBtn = document.getElementById('cancel-edit-btn');
const saveEditBtn = document.getElementById('save-edit-btn');
const deleteEditBtn = document.getElementById('delete-edit-btn');
let currentEditingDate = null; // 今編集している日付を保持する変数

// 編集モーダルを開く処理
function openEditModal(dateStr) {
  currentEditingDate = dateStr;
  const data = workData[dateStr];
  
  // 画面に元の日付と時間をセット
  document.getElementById('edit-date-display').textContent = `${dateStr} の記録`;
  document.getElementById('edit-start-time').value = data.start;
  document.getElementById('edit-end-time').value = data.end;
  
  editModal.classList.remove('hidden');
}

// 編集をキャンセルして閉じる
closeEditBtn.addEventListener('click', () => {
  editModal.classList.add('hidden');
  currentEditingDate = null;
});

// 編集内容を保存する
saveEditBtn.addEventListener('click', () => {
  const startTimeVal = document.getElementById('edit-start-time').value;
  const endTimeVal = document.getElementById('edit-end-time').value;

  const updatedData = calculateWorkData(startTimeVal, endTimeVal);
  if (!updatedData) return; // エラー時は処理中断

  workData[currentEditingDate] = updatedData;
  localStorage.setItem('workData', JSON.stringify(workData));

  editModal.classList.add('hidden');
  renderCalendar();
  updateCurrentMonthDisplay(); 
  alert("記録を更新しました！");
});

// 記録を削除する
deleteEditBtn.addEventListener('click', () => {
  if (confirm(`${currentEditingDate} の記録を削除してもよろしいですか？`)) {
    delete workData[currentEditingDate];
    localStorage.setItem('workData', JSON.stringify(workData));
    
    editModal.classList.add('hidden');
    renderCalendar();
    updateCurrentMonthDisplay(); 
    alert("記録を削除しました。");
  }
});


// ====== 初期化処理 ======
updateCurrentMonthDisplay();
renderCalendar();
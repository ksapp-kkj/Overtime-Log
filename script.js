// ====== 基本設定 ======
const BASE_WORK_MINUTES = 7 * 60 + 50;
const REST_PERIODS = [
  { start: 10 * 60, end: 10 * 60 + 10 },
  { start: 12 * 60, end: 12 * 60 + 50 },
  { start: 15 * 60, end: 15 * 60 + 10 }
];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function safeJSONParse(key, defaultValue) {
  try {
    const val = localStorage.getItem(key);
    if (!val || val === "undefined" || val === "null") return defaultValue;
    return JSON.parse(val);
  } catch (e) {
    console.warn(`[${key}] のデータ修復を行いました。`);
    return defaultValue;
  }
}

let workData = safeJSONParse('workData', {});
let holidaysData = safeJSONParse('holidaysData', {});

let monthStartDay = parseInt(localStorage.getItem('monthStartDay'), 10);
if (isNaN(monthStartDay)) monthStartDay = 21;

let defaultStartTime = localStorage.getItem('defaultStartTime') || "08:30";
let defaultEndTime = localStorage.getItem('defaultEndTime') || "17:30";

let isHolidayEditMode = false;

if (Array.isArray(holidaysData)) {
  let migrated = {};
  holidaysData.forEach(d => migrated[d] = 'holiday');
  holidaysData = migrated;
  localStorage.setItem('holidaysData', JSON.stringify(holidaysData));
}

let currentPeriodStartObj = null;
let currentPeriodEndObj = null;
let currentDisplayDate = new Date();


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
function formatDateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function getTargetPeriod(dateObj, startDaySetting) {
  let year = dateObj.getFullYear();
  let month = dateObj.getMonth() + 1;
  let date = dateObj.getDate();
  
  let targetYear = year;
  let targetMonth = month;
  let startMonth = month;
  let startDateObj, endDateObj;

  if (startDaySetting === 1) {
    startDateObj = new Date(year, month - 1, 1);
    endDateObj = new Date(year, month, 0);
    return { targetYear, targetMonth, startMonth, startDateObj, endDateObj };
  }

  if (date >= startDaySetting) {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
    startMonth = targetMonth - 1;
    startDateObj = new Date(year, month - 1, startDaySetting);
    endDateObj = new Date(year, month, startDaySetting - 1);
  } else {
    startMonth = targetMonth - 1;
    if (startMonth === 0) {
      startMonth = 12;
    }
    startDateObj = new Date(year, month - 2, startDaySetting);
    endDateObj = new Date(year, month - 1, startDaySetting - 1);
  }
  return { targetYear, targetMonth, startMonth, startDateObj, endDateObj };
}

function initTimeSelects() {
  const hours = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0'));
  const minutes = ["00", "10", "20", "30", "40", "50"];
  
  const [defStartH, defStartM] = defaultStartTime.split(':');
  const [defEndH, defEndM] = defaultEndTime.split(':');

  const selectsData = [
    {h: 'start-time-h', m: 'start-time-m', defH: defStartH, defM: defStartM},
    {h: 'end-time-h', m: 'end-time-m', defH: defEndH, defM: defEndM},
    {h: 'edit-start-time-h', m: 'edit-start-time-m', defH: defStartH, defM: defStartM},
    {h: 'edit-end-time-h', m: 'edit-end-time-m', defH: defEndH, defM: defEndM},
    {h: 'setting-start-time-h', m: 'setting-start-time-m', defH: defStartH, defM: defStartM},
    {h: 'setting-end-time-h', m: 'setting-end-time-m', defH: defEndH, defM: defEndM}
  ];

  selectsData.forEach(sel => {
    const hElem = document.getElementById(sel.h);
    const mElem = document.getElementById(sel.m);
    if (!hElem || !mElem) return;
    
    hElem.innerHTML = ''; mElem.innerHTML = '';

    hours.forEach(hr => {
      const opt = document.createElement('option');
      opt.value = hr; opt.textContent = hr;
      hElem.appendChild(opt);
    });
    hElem.value = sel.defH;

    minutes.forEach(min => {
      const opt = document.createElement('option');
      opt.value = min; opt.textContent = min;
      mElem.appendChild(opt);
    });
    mElem.value = sel.defM;
  });
}


// ====== メイン表示＆集計ロジック ======
function updateCurrentMonthDisplay() {
  const today = new Date();
  document.getElementById('today-date').textContent = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日(${WEEKDAYS[today.getDay()]})`;

  if (!document.getElementById('work-date').value) {
    document.getElementById('work-date').value = formatDateString(today);
  }

  const period = getTargetPeriod(today, monthStartDay);
  document.getElementById('current-month').textContent = `${period.targetYear}年${period.targetMonth}月度`;
  
  if (monthStartDay === 1) {
    document.getElementById('current-period').textContent = `${period.startMonth}/1〜${period.startMonth}/${period.endDateObj.getDate()}`;
  } else {
    document.getElementById('current-period').textContent = `${period.startMonth}/${monthStartDay}〜${period.targetMonth}/${monthStartDay - 1}`;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.round((period.endDateObj.getTime() - period.startDateObj.getTime()) / msPerDay) + 1;
  
  let holidayCount = 0;
  let paidLeaveCount = 0;
  let loopDate = new Date(period.startDateObj);
  
  while (loopDate <= period.endDateObj) {
    const dStr = formatDateString(loopDate);
    if (holidaysData[dStr] === 'holiday') holidayCount++;
    if (holidaysData[dStr] === 'paid_leave') paidLeaveCount++;
    loopDate.setDate(loopDate.getDate() + 1);
  }
  
  const workingDays = totalDays - holidayCount - paidLeaveCount;
  document.getElementById('work-days-display').textContent = workingDays;
  document.getElementById('paid-leave-display').textContent = paidLeaveCount;

  let totalOvertimeMins = 0;
  const pStart = new Date(period.startDateObj).setHours(0,0,0,0);
  const pEnd = new Date(period.endDateObj).setHours(0,0,0,0);

  for (const dateStr in workData) {
    const workDateMs = new Date(dateStr).setHours(0, 0, 0, 0);
    if (workDateMs >= pStart && workDateMs <= pEnd) {
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
  
  const startH = document.getElementById('start-time-h').value;
  const startM = document.getElementById('start-time-m').value;
  const endH = document.getElementById('end-time-h').value;
  const endM = document.getElementById('end-time-m').value;
  
  const startTimeVal = `${startH}:${startM}`;
  const endTimeVal = `${endH}:${endM}`;

  if (!dateVal) return;
  const newData = calculateWorkData(startTimeVal, endTimeVal);
  if (!newData) return; 

  workData[dateVal] = newData;
  localStorage.setItem('workData', JSON.stringify(workData));

  currentDisplayDate = new Date(dateVal);
  renderCalendar();
  updateCurrentMonthDisplay(); 
  alert("登録しました！");
});


// ====== カレンダー関連 ======
function renderCalendar() {
  const period = getTargetPeriod(currentDisplayDate, monthStartDay);
  document.getElementById('calendar-title').textContent = `${period.targetYear}年${period.targetMonth}月度`;

  const grid = document.querySelector('.calendar-grid');
  grid.innerHTML = `
    <div class="weekday weekday-header">日</div><div class="weekday weekday-header">月</div>
    <div class="weekday weekday-header">火</div><div class="weekday weekday-header">水</div>
    <div class="weekday weekday-header">木</div><div class="weekday weekday-header">金</div><div class="weekday weekday-header">土</div>
  `;

  if (isHolidayEditMode) {
    grid.classList.add('holiday-edit-mode');
  } else {
    grid.classList.remove('holiday-edit-mode');
  }

  const startDayIndex = period.startDateObj.getDay();
  for (let i = 0; i < startDayIndex; i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.classList.add('calendar-day', 'empty');
    grid.appendChild(emptyDiv);
  }

  let loopDate = new Date(period.startDateObj);
  while (loopDate <= period.endDateObj) {
    const dayDiv = document.createElement('div');
    dayDiv.classList.add('calendar-day');
    
    const fullDateStr = formatDateString(loopDate);
    const dayOfWeekStr = WEEKDAYS[loopDate.getDay()];

    let displayDate = loopDate.getDate();
    if (displayDate === 1 || displayDate === monthStartDay) {
      displayDate = `${loopDate.getMonth() + 1}/${displayDate}`;
    }

    const dType = holidaysData[fullDateStr];
    let badgeHtml = '';
    if (dType === 'holiday') {
      badgeHtml = `<span class="status-badge holiday-badge">休日</span>`;
    } else if (dType === 'paid_leave') {
      badgeHtml = `<span class="status-badge paid-leave-badge">有給</span>`;
    }

    dayDiv.innerHTML = `<div class="date-number">${displayDate} <span class="mobile-weekday">(${dayOfWeekStr})</span> ${badgeHtml}</div>`;
    
    if (workData[fullDateStr]) {
      dayDiv.classList.add('has-data');
      dayDiv.innerHTML += `<div class="overtime-display">${workData[fullDateStr].overtime}</div>`;
    } 
    
    dayDiv.addEventListener('click', function() {
      if (isHolidayEditMode) {
        if (dType === 'holiday') {
          holidaysData[fullDateStr] = 'paid_leave';
        } else if (dType === 'paid_leave') {
          delete holidaysData[fullDateStr];
        } else {
          holidaysData[fullDateStr] = 'holiday';
        }
        localStorage.setItem('holidaysData', JSON.stringify(holidaysData));
        updateCurrentMonthDisplay();
        renderCalendar();
      } else {
        if (workData[fullDateStr]) {
          openEditModal(fullDateStr);
        }
      }
    });

    grid.appendChild(dayDiv);
    loopDate.setDate(loopDate.getDate() + 1);
  }
}

document.getElementById('prev-month').addEventListener('click', () => {
  currentDisplayDate.setDate(15); 
  currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  currentDisplayDate.setDate(15);
  currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
  renderCalendar();
});

// ★ 追加：アコーディオン開閉と休日設定モードの連動
const toggleHolidayBtn = document.getElementById('toggle-holiday-mode-btn');
const holidayGuide = document.getElementById('holiday-mode-guide');
const toggleCalBtn = document.getElementById('toggle-calendar-btn'); // ボタンを取得しておく

if (toggleHolidayBtn) {
  toggleHolidayBtn.addEventListener('click', () => {
    isHolidayEditMode = !isHolidayEditMode;
    const grid = document.querySelector('.calendar-grid');
    
    if (isHolidayEditMode) {
      toggleHolidayBtn.textContent = '✅ 休日設定を完了する';
      toggleHolidayBtn.classList.add('active');
      holidayGuide.classList.remove('hidden');
      
      // ★ 連動：設定を始めたら、もしカレンダーが閉じていれば自動で開く
      if (grid && grid.classList.contains('collapsed')) {
        grid.classList.remove('collapsed');
        if (toggleCalBtn) toggleCalBtn.textContent = 'カレンダーを閉じる ▲';
      }
    } else {
      toggleHolidayBtn.textContent = '休日・有給を設定する';
      toggleHolidayBtn.classList.remove('active');
      holidayGuide.classList.add('hidden');
      
      // ★ 連動：スマホの場合、設定を完了したら自動でカレンダーを閉じる
      if (window.innerWidth <= 768 && grid && !grid.classList.contains('collapsed')) {
        grid.classList.add('collapsed');
        if (toggleCalBtn) toggleCalBtn.textContent = 'カレンダーを開く ▼';
      }
    }
    renderCalendar(); 
  });
}

if (toggleCalBtn) {
  toggleCalBtn.addEventListener('click', () => {
    const grid = document.querySelector('.calendar-grid');
    grid.classList.toggle('collapsed');
    if (grid.classList.contains('collapsed')) {
      toggleCalBtn.textContent = 'カレンダーを開く ▼';
    } else {
      toggleCalBtn.textContent = 'カレンダーを閉じる ▲';
    }
  });
}

if (window.innerWidth <= 768) {
  const grid = document.querySelector('.calendar-grid');
  if(grid) grid.classList.add('collapsed');
}


// ====== メニュー＆設定関連 ======
const openSettingsBtn = document.getElementById('open-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');

openSettingsBtn.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    document.getElementById('start-day-setting').value = monthStartDay;
    
    const [sH, sM] = defaultStartTime.split(':');
    const [eH, eM] = defaultEndTime.split(':');
    document.getElementById('setting-start-time-h').value = sH;
    document.getElementById('setting-start-time-m').value = sM;
    document.getElementById('setting-end-time-h').value = eH;
    document.getElementById('setting-end-time-m').value = eM;
    
    settingsModal.classList.remove('hidden');
  } catch (err) {
    console.error("モーダル展開エラー:", err);
    alert("エラーが発生しました。ページを再読み込みしてください。");
  }
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
  const newStartDay = parseInt(document.getElementById('start-day-setting').value, 10);
  
  const sH = document.getElementById('setting-start-time-h').value;
  const sM = document.getElementById('setting-start-time-m').value;
  const eH = document.getElementById('setting-end-time-h').value;
  const eM = document.getElementById('setting-end-time-m').value;

  if (newStartDay >= 1 && newStartDay <= 31) {
    monthStartDay = newStartDay;
    defaultStartTime = `${sH}:${sM}`;
    defaultEndTime = `${eH}:${eM}`;

    localStorage.setItem('monthStartDay', monthStartDay);
    localStorage.setItem('defaultStartTime', defaultStartTime);
    localStorage.setItem('defaultEndTime', defaultEndTime);
    
    document.getElementById('start-time-h').value = sH;
    document.getElementById('start-time-m').value = sM;
    document.getElementById('end-time-h').value = eH;
    document.getElementById('end-time-m').value = eM;
    
    updateCurrentMonthDisplay(); 
    renderCalendar(); 
    settingsModal.classList.add('hidden');
    alert("設定を保存しました！");
  } else {
    alert("開始日は1〜31の数字を入力してください。");
  }
});


// ====== 編集・削除関連 ======
const editModal = document.getElementById('edit-modal');
const closeEditBtn = document.getElementById('cancel-edit-btn');
const saveEditBtn = document.getElementById('save-edit-btn');
const deleteEditBtn = document.getElementById('delete-edit-btn');
let currentEditingDate = null; 

function openEditModal(dateStr) {
  currentEditingDate = dateStr;
  const data = workData[dateStr];
  document.getElementById('edit-date-display').textContent = `${dateStr} の記録`;
  
  if (data.start) {
    const [sH, sM] = data.start.split(':');
    document.getElementById('edit-start-time-h').value = sH;
    document.getElementById('edit-start-time-m').value = sM;
  }
  if (data.end) {
    const [eH, eM] = data.end.split(':');
    document.getElementById('edit-end-time-h').value = eH;
    document.getElementById('edit-end-time-m').value = eM;
  }
  
  editModal.classList.remove('hidden');
}

closeEditBtn.addEventListener('click', () => {
  editModal.classList.add('hidden');
  currentEditingDate = null;
});

saveEditBtn.addEventListener('click', () => {
  const sH = document.getElementById('edit-start-time-h').value;
  const sM = document.getElementById('edit-start-time-m').value;
  const eH = document.getElementById('edit-end-time-h').value;
  const eM = document.getElementById('edit-end-time-m').value;
  
  const startTimeVal = `${sH}:${sM}`;
  const endTimeVal = `${eH}:${eM}`;

  const updatedData = calculateWorkData(startTimeVal, endTimeVal);
  if (!updatedData) return;

  workData[currentEditingDate] = updatedData;
  localStorage.setItem('workData', JSON.stringify(workData));

  editModal.classList.add('hidden');
  renderCalendar();
  updateCurrentMonthDisplay(); 
  alert("記録を更新しました！");
});

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
try {
  initTimeSelects(); 
  updateCurrentMonthDisplay();
  renderCalendar();
} catch(e) {
  console.error("初期化時にエラーが発生しました:", e);
}

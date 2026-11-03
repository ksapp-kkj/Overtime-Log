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

let isCarryOverEnabled = localStorage.getItem('isCarryOverEnabled') !== 'false';
let settlementMonths = safeJSONParse('settlementMonths', [3, 6, 9, 12]);

let isHolidayEditMode = false;

if (Array.isArray(holidaysData)) {
  let migrated = {};
  holidaysData.forEach(d => migrated[d] = 'holiday');
  holidaysData = migrated;
  localStorage.setItem('holidaysData', JSON.stringify(holidaysData));
}

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

function getPeriodDates(targetYear, targetMonth, startDaySetting) {
  let startDateObj, endDateObj;
  if (startDaySetting === 1) {
    startDateObj = new Date(targetYear, targetMonth - 1, 1);
    endDateObj = new Date(targetYear, targetMonth, 0);
  } else {
    let startY = targetYear;
    let startM = targetMonth - 2; 
    if (startM < 0) {
      startM += 12;
      startY -= 1;
    }
    startDateObj = new Date(startY, startM, startDaySetting);
    
    let endY = targetYear;
    let endM = targetMonth - 1;
    if (endM < 0) { 
      endM += 12;
      endY -= 1;
    }
    endDateObj = new Date(endY, endM, startDaySetting - 1);
  }
  return { startDateObj, endDateObj };
}

function getNetOvertimeForMonth(targetYear, targetMonth) {
  const { startDateObj, endDateObj } = getPeriodDates(targetYear, targetMonth, monthStartDay);
  const pStart = startDateObj.getTime();
  const pEnd = endDateObj.setHours(23, 59, 59, 999); 
  
  let netMins = 0;
  for (const dateStr in workData) {
    const workDateMs = new Date(dateStr).getTime();
    if (workDateMs >= pStart && workDateMs <= pEnd) {
      const data = workData[dateStr];
      netMins += data.overtimeMins !== undefined ? data.overtimeMins : parseOvertimeString(data.overtime);
    }
  }
  return netMins;
}

function getMonthlySummary(targetYear, targetMonth) {
  if (!isCarryOverEnabled) {
    let netMins = getNetOvertimeForMonth(targetYear, targetMonth);
    return { net: netMins, carryOver: 0, cumulative: netMins };
  }
  
  let blockStartM = targetMonth;
  let blockStartY = targetYear;
  let foundSettlement = false;
  
  for (let i = 1; i <= 24; i++) {
    let checkM = targetMonth - i;
    let checkY = targetYear;
    while (checkM <= 0) {
      checkM += 12;
      checkY--;
    }
    if (settlementMonths.includes(checkM)) {
      blockStartM = checkM + 1;
      blockStartY = checkY;
      if (blockStartM > 12) {
        blockStartM -= 12;
        blockStartY++;
      }
      foundSettlement = true;
      break;
    }
  }
  
  if (!foundSettlement) {
    blockStartY = targetYear - 2;
    blockStartM = targetMonth;
  }
  
  let carryOverMins = 0;
  let calcY = blockStartY;
  let calcM = blockStartM;
  
  while (calcY < targetYear || (calcY === targetYear && calcM <= targetMonth)) {
    let net = getNetOvertimeForMonth(calcY, calcM);
    
    if (calcY === targetYear && calcM === targetMonth) {
      return {
        net: net,
        carryOver: carryOverMins,
        cumulative: carryOverMins + net
      };
    }
    
    let cumulative = carryOverMins + net;
    carryOverMins = cumulative < 0 ? cumulative : 0;
    
    calcM++;
    if (calcM > 12) {
      calcM = 1;
      calcY++;
    }
  }
}

// ★ 追加：入力フォームに既存の記録を自動セットする関数
function loadFormData(dateStr) {
  const data = workData[dateStr];
  let sH, sM, eH, eM;
  const [defStartH, defStartM] = defaultStartTime.split(':');
  const [defEndH, defEndM] = defaultEndTime.split(':');

  if (data) {
    if (data.start) {
      [sH, sM] = data.start.split(':');
    } else {
      [sH, sM] = [defStartH, defStartM];
    }
    if (data.end) {
      [eH, eM] = data.end.split(':');
    } else {
      [eH, eM] = [defEndH, defEndM];
    }
  } else {
    [sH, sM] = [defStartH, defStartM];
    [eH, eM] = [defEndH, defEndM];
  }

  document.getElementById('start-time-h').value = sH;
  document.getElementById('start-time-m').value = sM;
  document.getElementById('end-time-h').value = eH;
  document.getElementById('end-time-m').value = eM;
}

// 日付を変更した時にデータを読み込む
document.getElementById('work-date').addEventListener('change', function() {
  loadFormData(this.value);
});


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
  const period = getTargetPeriod(currentDisplayDate, monthStartDay);
  
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

  const summary = getMonthlySummary(period.targetYear, period.targetMonth);
  
  document.getElementById('carryover-overtime').textContent = minutesToDisplay(summary.carryOver);
  document.getElementById('net-overtime').textContent = minutesToDisplay(summary.net);
  
  const totalDisplay = document.getElementById('total-overtime');
  totalDisplay.textContent = minutesToDisplay(summary.cumulative);
  
  if (summary.cumulative < 0) {
    totalDisplay.style.color = '#e53e3e';
  } else {
    totalDisplay.style.color = '#2b6cb0';
  }
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


// ====== ★追加：単独打刻（出勤のみ・退勤のみ）処理 ======
document.getElementById('btn-record-start').addEventListener('click', function() {
  const dateVal = document.getElementById('work-date').value;
  if (!dateVal) return;
  
  const startH = document.getElementById('start-time-h').value;
  const startM = document.getElementById('start-time-m').value;
  const startTimeVal = `${startH}:${startM}`;
  
  let data = workData[dateVal] || {};
  data.start = startTimeVal;
  
  if (data.end) {
    const newData = calculateWorkData(data.start, data.end);
    if (!newData) return; 
    data = newData;
  } else {
    data.actual = null;
    data.overtime = null;
    data.overtimeMins = 0;
  }
  
  workData[dateVal] = data;
  localStorage.setItem('workData', JSON.stringify(workData));
  
  currentDisplayDate = new Date(dateVal);
  renderCalendar();
  updateCurrentMonthDisplay(); 
  alert(`${dateVal} の出勤（${startTimeVal}）を記録しました！`);
});

document.getElementById('btn-record-end').addEventListener('click', function() {
  const dateVal = document.getElementById('work-date').value;
  if (!dateVal) return;
  
  const endH = document.getElementById('end-time-h').value;
  const endM = document.getElementById('end-time-m').value;
  const endTimeVal = `${endH}:${endM}`;
  
  let data = workData[dateVal] || {};
  data.end = endTimeVal;
  
  if (data.start) {
    const newData = calculateWorkData(data.start, data.end);
    if (!newData) return; 
    data = newData;
  } else {
    data.actual = null;
    data.overtime = null;
    data.overtimeMins = 0;
  }
  
  workData[dateVal] = data;
  localStorage.setItem('workData', JSON.stringify(workData));
  
  currentDisplayDate = new Date(dateVal);
  renderCalendar();
  updateCurrentMonthDisplay(); 
  alert(`${dateVal} の退勤（${endTimeVal}）を記録しました！`);
});

// ====== 一括登録処理（従来通り） ======
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
  alert("出退勤を一括登録しました！");
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
    
    // ★ 変更：出勤のみ、退勤のみの状態をカレンダーに表示
    if (workData[fullDateStr]) {
      dayDiv.classList.add('has-data');
      const d = workData[fullDateStr];
      if (d.overtime !== null && d.overtime !== undefined) {
        dayDiv.innerHTML += `<div class="overtime-display">${d.overtime}</div>`;
      } else if (d.start && !d.end) {
        dayDiv.innerHTML += `<div class="overtime-display" style="color:#48bb78; font-size:0.75rem;">出勤のみ</div>`;
      } else if (!d.start && d.end) {
        dayDiv.innerHTML += `<div class="overtime-display" style="color:#ed8936; font-size:0.75rem;">退勤のみ</div>`;
      }
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
  updateCurrentMonthDisplay(); 
});

document.getElementById('next-month').addEventListener('click', () => {
  currentDisplayDate.setDate(15);
  currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
  renderCalendar();
  updateCurrentMonthDisplay(); 
});

const toggleHolidayBtn = document.getElementById('toggle-holiday-mode-btn');
const holidayGuide = document.getElementById('holiday-mode-guide');
const toggleCalBtn = document.getElementById('toggle-calendar-btn'); 

if (toggleHolidayBtn) {
  toggleHolidayBtn.addEventListener('click', () => {
    isHolidayEditMode = !isHolidayEditMode;
    const grid = document.querySelector('.calendar-grid');
    
    if (isHolidayEditMode) {
      toggleHolidayBtn.textContent = '✅ 休日設定を完了する';
      toggleHolidayBtn.classList.add('active');
      holidayGuide.classList.remove('hidden');
      
      if (grid && grid.classList.contains('collapsed')) {
        grid.classList.remove('collapsed');
        if (toggleCalBtn) toggleCalBtn.textContent = 'カレンダーを閉じる ▲';
      }
    } else {
      toggleHolidayBtn.textContent = '休日・有給を設定する';
      toggleHolidayBtn.classList.remove('active');
      holidayGuide.classList.add('hidden');
      
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
const carryoverSettingSelect = document.getElementById('carryover-setting');
const settlementContainer = document.getElementById('settlement-months-container');

function renderSettlementCheckboxes() {
  const container = document.getElementById('settlement-checkboxes');
  container.innerHTML = '';
  for(let i=1; i<=12; i++){
    const lbl = document.createElement('label');
    lbl.className = 'settlement-label';
    lbl.innerHTML = `<input type="checkbox" class="settlement-chk" value="${i}" ${settlementMonths.includes(i) ? 'checked' : ''}> ${i}月`;
    container.appendChild(lbl);
  }
}

carryoverSettingSelect.addEventListener('change', (e) => {
  if (e.target.value === 'active') {
    settlementContainer.classList.remove('hidden');
  } else {
    settlementContainer.classList.add('hidden');
  }
});

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
    
    carryoverSettingSelect.value = isCarryOverEnabled ? 'active' : 'none';
    if (isCarryOverEnabled) {
      settlementContainer.classList.remove('hidden');
    } else {
      settlementContainer.classList.add('hidden');
    }
    renderSettlementCheckboxes();
    
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
    
    isCarryOverEnabled = (carryoverSettingSelect.value === 'active');
    
    let selectedMonths = [];
    document.querySelectorAll('.settlement-chk').forEach(chk => {
      if (chk.checked) selectedMonths.push(parseInt(chk.value, 10));
    });
    settlementMonths = selectedMonths;

    localStorage.setItem('monthStartDay', monthStartDay);
    localStorage.setItem('defaultStartTime', defaultStartTime);
    localStorage.setItem('defaultEndTime', defaultEndTime);
    localStorage.setItem('isCarryOverEnabled', isCarryOverEnabled);
    localStorage.setItem('settlementMonths', JSON.stringify(settlementMonths));
    
    // 保存後、現在の入力フォームに設定を反映（データがある場合は維持）
    loadFormData(document.getElementById('work-date').value);
    
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
  
  const [defStartH, defStartM] = defaultStartTime.split(':');
  const [defEndH, defEndM] = defaultEndTime.split(':');

  // ★変更：片方しか打刻されていない場合も想定してモーダルにセット
  if (data.start) {
    const [sH, sM] = data.start.split(':');
    document.getElementById('edit-start-time-h').value = sH;
    document.getElementById('edit-start-time-m').value = sM;
  } else {
    document.getElementById('edit-start-time-h').value = defStartH;
    document.getElementById('edit-start-time-m').value = defStartM;
  }
  
  if (data.end) {
    const [eH, eM] = data.end.split(':');
    document.getElementById('edit-end-time-h').value = eH;
    document.getElementById('edit-end-time-m').value = eM;
  } else {
    document.getElementById('edit-end-time-h').value = defEndH;
    document.getElementById('edit-end-time-m').value = defEndM;
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
  
  if(currentEditingDate === document.getElementById('work-date').value) {
    loadFormData(currentEditingDate);
  }
});

deleteEditBtn.addEventListener('click', () => {
  if (confirm(`${currentEditingDate} の記録を削除してもよろしいですか？`)) {
    delete workData[currentEditingDate];
    localStorage.setItem('workData', JSON.stringify(workData));
    
    editModal.classList.add('hidden');
    renderCalendar();
    updateCurrentMonthDisplay(); 
    alert("記録を削除しました。");
    
    if(currentEditingDate === document.getElementById('work-date').value) {
      loadFormData(currentEditingDate);
    }
  }
});

// ====== 初期化処理 ======
try {
  if (!document.getElementById('work-date').value) {
    document.getElementById('work-date').value = formatDateString(new Date());
  }
  initTimeSelects(); 
  loadFormData(document.getElementById('work-date').value); // ★追加：既存データをフォームに復元
  
  updateCurrentMonthDisplay();
  renderCalendar();
} catch(e) {
  console.error("初期化時にエラーが発生しました:", e);
}

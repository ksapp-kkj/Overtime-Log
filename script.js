// ====== 基本設定 ======
const BASE_WORK_MINUTES = 7 * 60 + 50;
const REST_PERIODS = [
  { start: 10 * 60, end: 10 * 60 + 10 },
  { start: 12 * 60, end: 12 * 60 + 50 },
  { start: 15 * 60, end: 15 * 60 + 10 }
];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

let workData = JSON.parse(localStorage.getItem('workData')) || {};
let holidaysData = JSON.parse(localStorage.getItem('holidaysData')) || [];
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

function formatDateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ★ 追加：現在の日付に基づく「対象月度の期間」を計算する関数
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


// ====== メイン表示＆集計ロジック ======
function updateCurrentMonthDisplay() {
  const today = new Date();
  document.getElementById('today-date').textContent = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日(${WEEKDAYS[today.getDay()]})`;

  if (!document.getElementById('work-date').value) {
    document.getElementById('work-date').value = formatDateString(today);
  }

  // 期間を取得
  const period = getTargetPeriod(today, monthStartDay);
  
  // HTMLを更新
  document.getElementById('current-month').textContent = `${period.targetYear}年${period.targetMonth}月度`;
  
  if (monthStartDay === 1) {
    document.getElementById('current-period').textContent = `${period.startMonth}/1〜${period.startMonth}/${period.endDateObj.getDate()}`;
  } else {
    document.getElementById('current-period').textContent = `${period.startMonth}/${monthStartDay}〜${period.targetMonth}/${monthStartDay - 1}`;
  }

  // 出勤日数の計算
  // getTime() でミリ秒比較にして正確に日数を出す
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.round((period.endDateObj.getTime() - period.startDateObj.getTime()) / msPerDay) + 1;
  
  let holidayCount = 0;
  // ループ用に新しいDateオブジェクトを作成（元の期間を汚染しない）
  let loopDate = new Date(period.startDateObj);
  while (loopDate <= period.endDateObj) {
    if (holidaysData.includes(formatDateString(loopDate))) {
      holidayCount++;
    }
    loopDate.setDate(loopDate.getDate() + 1);
  }
  
  const workingDays = totalDays - holidayCount;
  document.getElementById('work-days-display').textContent = workingDays;

  // 残業時間の計算
  let totalOvertimeMins = 0;
  // 比較用に時刻を0:00にリセット
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
  const startTimeVal = document.getElementById('start-time').value;
  const endTimeVal = document.getElementById('end-time').value;

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
  // ★ 変更：単なる「1日〜月末」ではなく、現在の月度期間（例: 21日〜20日）を取得する
  const period = getTargetPeriod(currentDisplayDate, monthStartDay);

  // カレンダーのタイトルを「〇〇年〇月度」に変更
  document.getElementById('calendar-title').textContent = `${period.targetYear}年${period.targetMonth}月度`;

  const grid = document.querySelector('.calendar-grid');
  
  grid.innerHTML = `
    <div class="weekday weekday-header">日</div><div class="weekday weekday-header">月</div>
    <div class="weekday weekday-header">火</div><div class="weekday weekday-header">水</div>
    <div class="weekday weekday-header">木</div><div class="weekday weekday-header">金</div><div class="weekday weekday-header">土</div>
  `;

  // 期間の開始日の曜日に合わせて、最初の空白マスを追加
  const startDayIndex = period.startDateObj.getDay();
  for (let i = 0; i < startDayIndex; i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.classList.add('calendar-day', 'empty');
    grid.appendChild(emptyDiv);
  }

  // 期間の開始日から終了日までループしてマスを作る
  let loopDate = new Date(period.startDateObj);
  while (loopDate <= period.endDateObj) {
    const dayDiv = document.createElement('div');
    dayDiv.classList.add('calendar-day');
    
    const fullDateStr = formatDateString(loopDate);
    const dayOfWeekStr = WEEKDAYS[loopDate.getDay()];

    // ★ 変更：月をまたぐ時（1日）と、月度の開始日には「9/21」のように月も表示する
    let displayDate = loopDate.getDate();
    if (displayDate === 1 || displayDate === monthStartDay) {
      displayDate = `${loopDate.getMonth() + 1}/${displayDate}`;
    }

    // 日付を表示
    dayDiv.innerHTML = `<div class="date-number">${displayDate} <span class="mobile-weekday">(${dayOfWeekStr})</span></div>`;
    
    // データがあれば残業時間を表示
    if (workData[fullDateStr]) {
      dayDiv.classList.add('has-data');
      dayDiv.innerHTML += `<div class="overtime-display">${workData[fullDateStr].overtime}</div>`;
      
      dayDiv.addEventListener('click', function() {
        openEditModal(fullDateStr);
      });
    }
    
    grid.appendChild(dayDiv);
    
    // 次の日へ
    loopDate.setDate(loopDate.getDate() + 1);
  }
}

// （※すぐ下にある先月・来月ボタンの処理に、バグ防止のため setDate(15) を追加しておくと安全だよ！）
document.getElementById('prev-month').addEventListener('click', () => {
  currentDisplayDate.setDate(15); // 月またぎの計算ズレを防ぐため15日に固定
  currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  currentDisplayDate.setDate(15);
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
  document.getElementById('modal-period-display').textContent = document.getElementById('current-period').textContent;
  
  renderHolidayGrid();
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
    localStorage.setItem('holidaysData', JSON.stringify(holidaysData));
    
    updateCurrentMonthDisplay(); 
    settingsModal.classList.add('hidden');
    alert("月度設定と休日を保存しました！");
  } else {
    alert("開始日は1〜31の数字を入力してください。");
  }
});


// ★ 変更：休日選択グリッドを描画する関数（カレンダー形式に整列）
function renderHolidayGrid() {
  const grid = document.getElementById('holiday-grid');
  grid.innerHTML = ''; 
  
  // 表示中の期間を再取得
  const period = getTargetPeriod(new Date(), monthStartDay);
  
  // 1. 曜日のヘッダー（日〜土）を先に追加
  WEEKDAYS.forEach(day => {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'weekday';
    headerDiv.style.fontSize = '0.85rem';
    headerDiv.textContent = day;
    grid.appendChild(headerDiv);
  });

  // 2. 期間開始日の曜日（0:日曜 〜 6:土曜）に合わせて、最初の空白マスを入れる
  const startDayIndex = period.startDateObj.getDay();
  for (let i = 0; i < startDayIndex; i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'holiday-btn empty-btn';
    grid.appendChild(emptyDiv);
  }
  
  // 3. 日付ボタンを順番に配置
  let loopDate = new Date(period.startDateObj);
  while (loopDate <= period.endDateObj) {
    const dateStr = formatDateString(loopDate);
    
    const btn = document.createElement('div');
    btn.className = 'holiday-btn';
    
    if (holidaysData.includes(dateStr)) {
      btn.classList.add('is-holiday');
    }
    
    btn.innerHTML = `<span class="h-date">${loopDate.getDate()}</span><span class="h-day">${WEEKDAYS[loopDate.getDay()]}</span>`;
    
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-holiday')) {
        btn.classList.remove('is-holiday');
        holidaysData = holidaysData.filter(hd => hd !== dateStr);
      } else {
        btn.classList.add('is-holiday');
        holidaysData.push(dateStr);
      }
    });
    
    grid.appendChild(btn);
    loopDate.setDate(loopDate.getDate() + 1);
  }
}


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
  document.getElementById('edit-start-time').value = data.start;
  document.getElementById('edit-end-time').value = data.end;
  editModal.classList.remove('hidden');
}

closeEditBtn.addEventListener('click', () => {
  editModal.classList.add('hidden');
  currentEditingDate = null;
});

saveEditBtn.addEventListener('click', () => {
  const startTimeVal = document.getElementById('edit-start-time').value;
  const endTimeVal = document.getElementById('edit-end-time').value;

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
updateCurrentMonthDisplay();
renderCalendar();

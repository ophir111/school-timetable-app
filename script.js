const button = document.getElementById("loadBtn");
const lessonsDiv = document.getElementById("lessons");
const dayButtonsDiv = document.getElementById("dayButtons");
const classSelect = document.getElementById("classSelect");
let savedClass = localStorage.getItem("selectedClass");
const themeToggle = document.getElementById("themeToggle");
const DATA_URL = "/data";
const updateStatus =
  document.getElementById("updateStatus");

const lessonTimes = {
  1: { start: "08:20", end: "09:00" },
  2: { start: "09:10", end: "09:50" },
  3: { start: "10:10", end: "10:50" },
  4: { start: "11:00", end: "11:40" },
  5: { start: "11:50", end: "12:30" },
  6: { start: "13:00", end: "13:40" },
  7: { start: "13:45", end: "14:25" },
  8: { start: "14:30", end: "15:10" },
  9: { start: "15:10", end: "15:50" }
};

button.addEventListener("click", async () => {
  await loadSelectedTimetable({
    forceRefresh: true
  });
});

async function loadSelectedTimetable(
  { forceRefresh = false } = {}
) {
  button.disabled = true;
  classSelect.disabled = true;

  button.innerText = forceRefresh
    ? "מרענן..."
    : "טוען...";

  try {
    await ensureClassListLoaded(forceRefresh);

    const selectedClass =
      classSelect.value ||
      savedClass ||
      classSelect.options[0]?.value;

    if (!selectedClass) {
      throw new Error("No class is available");
    }

    classSelect.value = selectedClass;

    const cacheBuster = forceRefresh
      ? `?time=${Date.now()}`
      : "";

    const response = await fetch(
      `${DATA_URL}/${encodeURIComponent(
        selectedClass
      )}.html${cacheBuster}`,
      {
        cache: forceRefresh
          ? "no-store"
          : "default"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Timetable file returned ${response.status}`
      );
    }

    const htmlText = await response.text();

    processTimetableHtml(htmlText);

    savedClass = selectedClass;

    localStorage.setItem(
      "selectedClass",
      selectedClass
    );

    await updateLastUpdatedText(forceRefresh);

    button.innerText = "רענן מערכת";
  } catch (error) {
    console.error(error);

    updateStatus.innerText =
      "טעינת המערכת נכשלה";

    alert("טעינת המערכת נכשלה");

    button.innerText = "נסה שוב";
  } finally {
    button.disabled = false;
    classSelect.disabled = false;
  }
}

async function ensureClassListLoaded(
  forceRefresh = false
) {
  if (
    classSelect.options.length > 1 &&
    classSelect.value
  ) {
    return;
  }

  const cacheBuster = forceRefresh
    ? `?time=${Date.now()}`
    : "";

  const response = await fetch(
    `${DATA_URL}/classes.json${cacheBuster}`,
    {
      cache: forceRefresh
        ? "no-store"
        : "default"
    }
  );

  if (!response.ok) {
    throw new Error(
      `Class list returned ${response.status}`
    );
  }

  const data = await response.json();

  if (
    !Array.isArray(data.classes) ||
    data.classes.length === 0
  ) {
    throw new Error("Class list is empty");
  }

  classSelect.innerHTML = "";

  for (const classInfo of data.classes) {
    const option = document.createElement("option");

    option.value = classInfo.id;
    option.innerText = classInfo.name;

    classSelect.appendChild(option);
  }

  const classStillExists = data.classes.some(
    (classInfo) => classInfo.id === savedClass
  );

  if (classStillExists) {
    classSelect.value = savedClass;
  } else {
    classSelect.selectedIndex = 0;
    savedClass = classSelect.value;

    localStorage.setItem(
      "selectedClass",
      savedClass
    );
  }
}

function processTimetableHtml(htmlText) {
  const parser = new DOMParser();

  const doc = parser.parseFromString(
    htmlText,
    "text/html"
  );

  const table = doc.querySelector(".TTTable");

  if (!table) {
    throw new Error(
      "Could not find timetable table"
    );
  }

  const rows = Array.from(
    table.children[0].children
  );

  const timetableItems = [];

  const headerCells = Array.from(
    rows[0].children
  );

  const days = [];

  for (
    let index = 1;
    index < headerCells.length;
    index++
  ) {
    days.push(
      headerCells[index].innerText.trim()
    );
  }

  rows.forEach((row, rowIndex) => {
    if (rowIndex === 0) {
      return;
    }

    const cells = Array.from(row.children);

    if (cells.length < 2) {
      return;
    }

    const lessonNumber =
      cells[0].innerText.trim();

    for (
      let index = 1;
      index < cells.length;
      index++
    ) {
      const cell = cells[index];
      const dayName = days[index - 1];

      const items = cell.querySelectorAll(
        ".TTLesson, " +
        ".TableFreeChange, " +
        ".TableFillChange, " +
        ".TableEventChange"
      );

      items.forEach((item) => {
        const type = getItemType(item);

        const timetableItem = {
          day: dayName,
          lessonNumber,
          type,
          rawText: item.innerText.trim()
        };

        if (type === "lesson") {
          const lessonData = parseLesson(item);

          timetableItem.subject =
            lessonData.subject;

          timetableItem.details =
            lessonData.details;

          timetableItem.teacher =
            lessonData.teacher;
        }

        timetableItems.push(timetableItem);
      });
    }
  });

  const todayName = getTodayHebrewName();

  const todayDay = days.find((day) => {
    return cleanText(day).includes(
      cleanText(todayName)
    );
  });

  if (todayDay) {
    const todayItems = timetableItems.filter(
      (item) => item.day === todayDay
    );

    renderTimetable(
      todayItems,
      days,
      timetableItems,
      todayDay
    );
  } else {
    renderTimetable(
      timetableItems,
      days,
      timetableItems,
      "all"
    );
  }
}

async function updateLastUpdatedText(
  forceRefresh = false
) {
  try {
    const cacheBuster = forceRefresh
      ? `?time=${Date.now()}`
      : "";

    const response = await fetch(
      `${DATA_URL}/status.json${cacheBuster}`,
      {
        cache: forceRefresh
          ? "no-store"
          : "default"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Status returned ${response.status}`
      );
    }

    const status = await response.json();

    const updatedDate = new Date(
      status.updatedAt
    );

    if (
      Number.isNaN(updatedDate.getTime())
    ) {
      throw new Error(
        "Invalid update timestamp"
      );
    }

    const formattedTime =
      new Intl.DateTimeFormat("he-IL", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(updatedDate);

    const ageMinutes = Math.floor(
      (Date.now() - updatedDate.getTime()) /
      60000
    );

    if (ageMinutes > 45) {
      updateStatus.innerText =
        `עודכן לאחרונה: ${formattedTime} ` +
        `— המידע עשוי להיות ישן`;
    } else {
      updateStatus.innerText =
        `עודכן לאחרונה: ${formattedTime}`;
    }
  } catch (error) {
    console.warn(
      "Could not load update status:",
      error
    );

    updateStatus.innerText =
      "זמן העדכון האחרון אינו זמין";
  }
}

classSelect.addEventListener("change", async () => {
  savedClass = classSelect.value;

  localStorage.setItem(
    "selectedClass",
    savedClass
  );

  await loadSelectedTimetable();
});

window.addEventListener("load", async () => {
  await loadSelectedTimetable();
});

function getItemType(item) {
  if (item.classList.contains("TTLesson")) return "lesson";
  if (item.classList.contains("TableFreeChange")) return "cancellation";
  if (item.classList.contains("TableFillChange")) return "change";
  if (item.classList.contains("TableEventChange")) return "event";
  return "unknown";
}

function parseLesson(item) {
  const subject = item.querySelector("b")?.innerText.trim() || "";
  const fullText = item.innerText.trim();

  const details = fullText
    .replace(subject, "")
    .replace(")", ") ")
    .trim();

  const teacher = "";

  return {
    subject,
    details,
    teacher
  };
}

function renderTimetable(items, days, allItems, selectedDay) {
  const todayName = getTodayHebrewName();

  lessonsDiv.innerHTML = "";
  dayButtonsDiv.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.innerText = "כל השבוע";
  allButton.className = selectedDay === "all" ? "day-button active" : "day-button";

  allButton.addEventListener("click", () => {
    renderTimetable(allItems, days, allItems, "all");
  });

  dayButtonsDiv.appendChild(allButton);

  days.forEach((day) => {
    const button = document.createElement("button");
    button.innerText = day;

    button.addEventListener("click", () => {
      const filteredItems = allItems.filter(item => item.day === day);
      renderTimetable(filteredItems, days, allItems, day);
    });

    button.className = selectedDay === day ? "day-button active" : "day-button";

    if (cleanText(day).includes(cleanText(todayName))) {
      button.classList.add("today");
    }

    dayButtonsDiv.appendChild(button);
  });

  const daySections = {};
  const lessonBoxes = {};

  days.forEach((day) => {
    const hasItems = items.some(item => item.day === day);
    if (!hasItems) return;

    const section = document.createElement("div");
    section.className = "day-section";

    const title = document.createElement("h2");
    title.innerText = day;

    section.appendChild(title);
    lessonsDiv.appendChild(section);

    daySections[day] = section;
  });

  days.forEach((day) => {
    if (!daySections[day]) return;

    const lastLessonNumber = getLastLessonNumberForDay(day, items);

    for (let lessonNumber = 0; lessonNumber <= lastLessonNumber; lessonNumber++) {
      const lessonKey = `${day}-${lessonNumber}`;

      const box = document.createElement("div");
      box.className = "lesson-box";

      const isToday = cleanText(day).includes(cleanText(todayName));

      if (isToday && isCurrentLesson(lessonNumber)) {
        box.classList.add("current-lesson");
      }

      const title = document.createElement("h3");
      title.className = "lesson-title";

      const time = lessonTimes[lessonNumber];

      if (time) {
        title.innerHTML = `
          <span>שיעור ${lessonNumber}</span>
          <span class="lesson-time">${time.start}–${time.end}</span>
          <span class="collapse-arrow">⌄</span>
        `;
      } else {
        title.innerHTML = `
          <span>שיעור ${lessonNumber}</span>
          <span class="collapse-arrow">⌄</span>
        `;
      }

      title.addEventListener("click", () => {
        box.classList.toggle("collapsed");
      });

      box.appendChild(title);

      const emptyText = document.createElement("div");
      emptyText.className = "empty-placeholder";
      emptyText.innerText = "אין שיעורים";

      box.appendChild(emptyText);

      daySections[day].appendChild(box);
      lessonBoxes[lessonKey] = box;
    }
  });

  items.forEach((item) => {
    const lessonKey = `${item.day}-${item.lessonNumber}`;

    const card = document.createElement("div");
    card.className = `lesson ${item.type}`;

    if (item.type === "lesson") {
      card.innerHTML = `
        <div class="subject">${item.subject}</div>
        <div class="details">${item.details}</div>
        ${item.teacher ? `<div class="teacher">${item.teacher}</div>` : ""}
      `;
    } else {
      card.innerHTML = `
        <div class="status-label">${getStatusLabel(item.type)}</div>
        <div class="status-text">${item.rawText}</div>
      `;
    }

    const box = lessonBoxes[lessonKey];

    if (!box) {
      return;
    }

    const placeholder = box.querySelector(".empty-placeholder");

    if (placeholder) {
      placeholder.remove();
    }

    box.appendChild(card);
  });
}

function getLastLessonNumberForDay(day, items) {
  const dayItems = items.filter(item => item.day === day);

  if (dayItems.length === 0) {
    return 0;
  }

  return Math.max(...dayItems.map(item => Number(item.lessonNumber)));
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getTodayHebrewName() {
  const days = [
    "יום ראשון",
    "יום שני",
    "יום שלישי",
    "יום רביעי",
    "יום חמישי",
    "יום שישי",
    "יום שבת"
  ];

  return days[new Date().getDay()];
}

function getCurrentTimeString() {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function isCurrentLesson(lessonNumber) {
  const lesson = lessonTimes[lessonNumber];

  if (!lesson) return false;

  const current = getCurrentTimeString();

  return current >= lesson.start && current <= lesson.end;
}

function getStatusLabel(type) {
  if (type === "cancellation") return "ביטול";
  if (type === "change") return "שינוי";
  if (type === "event") return "אירוע";
  return "מידע";
}

classSelect.addEventListener("change", () => {
  savedClass = classSelect.value;
  localStorage.setItem("selectedClass", savedClass);
  button.click();
});

const savedTheme = localStorage.getItem("theme");

if (savedTheme === "dark") {
  document.body.classList.add("dark");
  themeToggle.innerText = "☼";
} else {
  themeToggle.innerText = "☾";
}

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  if (document.body.classList.contains("dark")) {
    localStorage.setItem("theme", "dark");
    themeToggle.innerText = "☼";
  } else {
    localStorage.setItem("theme", "light");
    themeToggle.innerText = "☾";
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
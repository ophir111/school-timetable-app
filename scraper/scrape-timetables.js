const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

const SCHOOL_URL = "https://gymnasia.iscool.co.il/";

const DATA_DIRECTORY = path.join(
  __dirname,
  "..",
  "data"
);

const ERROR_DIRECTORY = path.join(
  DATA_DIRECTORY,
  "errors"
);

// A small pause is polite to the school website.
const DELAY_BETWEEN_CLASSES_MS = 1500;

const CLASS_SELECTOR =
  "#dnn_ctr17993_TimeTableView_ClassesList";

const TIMETABLE_BUTTON =
  "#dnn_ctr17993_TimeTableView_btnChangesTable";

async function main() {
  await fs.mkdir(DATA_DIRECTORY, {
    recursive: true
  });

  await fs.mkdir(ERROR_DIRECTORY, {
    recursive: true
  });

  const browser = await chromium.launch({
    headless: true
  });

  try {
    console.log("Reading class list…");

    const classes = await getClassList(browser);

    if (classes.length === 0) {
      throw new Error(
        "The school website returned no classes"
      );
    }

    console.log(
      `Found ${classes.length} classes`
    );

    await saveClassesFile(classes);

    const results = [];

    for (let index = 0; index < classes.length; index++) {
      const classInfo = classes[index];

      console.log(
        `[${index + 1}/${classes.length}] ` +
        `Scraping ${classInfo.name} (${classInfo.id})…`
      );

      try {
        await scrapeClass(
          browser,
          classInfo,
          classes
        );

        results.push({
          ...classInfo,
          success: true
        });

        console.log(
          `Saved data/${classInfo.id}.html`
        );
      } catch (error) {
        console.error(
          `Failed class ${classInfo.id}:`,
          error.message
        );

        results.push({
          ...classInfo,
          success: false,
          error: error.message
        });
      }

      if (index < classes.length - 1) {
        await delay(DELAY_BETWEEN_CLASSES_MS);
      }
    }

    await saveStatusFile(results);

    const successfulCount = results.filter(
      (result) => result.success
    ).length;

    const failedCount =
      results.length - successfulCount;

    console.log("");
    console.log("Scraping complete");
    console.log(
      `Successful: ${successfulCount}`
    );
    console.log(`Failed: ${failedCount}`);

    /*
     * Fail the GitHub Action only if every class failed.
     * A single temporary class failure should not prevent
     * the successfully updated files from being published.
     */
    if (successfulCount === 0) {
      throw new Error(
        "Every timetable scrape failed"
      );
    }
  } finally {
    await browser.close();
  }
}

async function getClassList(browser) {
  const page = await createPage(browser);

  try {
    await openSchoolPage(page);

    await page.waitForSelector(CLASS_SELECTOR, {
      state: "visible",
      timeout: 30000
    });

    const classes = await page
      .locator(CLASS_SELECTOR)
      .evaluate((select) => {
        return Array.from(select.options)
          .map((option) => ({
            id: option.value.trim(),
            name: option.textContent.trim()
          }))
          .filter((item) => {
            return (
              item.id !== "" &&
              /^\d+$/.test(item.id)
            );
          });
      });

    return removeDuplicateClasses(classes);
  } finally {
    await page.close();
  }
}

async function scrapeClass(
  browser,
  classInfo,
  allClasses
) {
  const page = await createPage(browser);

  try {
    await openSchoolPage(page);

    await page.waitForSelector(CLASS_SELECTOR, {
      state: "visible",
      timeout: 30000
    });

    await page.waitForSelector(TIMETABLE_BUTTON, {
      state: "visible",
      timeout: 30000
    });

    /*
     * Set the dropdown without firing its onchange event.
     * The real timetable button will perform the postback.
     */
    await page.locator(CLASS_SELECTOR).evaluate(
      (select, classId) => {
        select.value = classId;

        for (const option of select.options) {
          option.selected =
            option.value === classId;
        }
      },
      classInfo.id
    );

    const selectedValue = await page
      .locator(CLASS_SELECTOR)
      .inputValue();

    if (selectedValue !== classInfo.id) {
      throw new Error(
        `Could not select class ${classInfo.id}`
      );
    }

    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 60000
      }),

      page.locator(TIMETABLE_BUTTON).click({
        timeout: 30000
      })
    ]);

    if (page.url().includes("Error500.htm")) {
      throw new Error(
        "The school website returned Error500"
      );
    }

    await page.waitForSelector(".TTTable", {
      state: "attached",
      timeout: 30000
    });

    const timetableHtml = await page
      .locator(".TTTable")
      .evaluate((table) => table.outerHTML);

    if (!timetableHtml.includes("TTTable")) {
      throw new Error(
        "The timetable table was empty"
      );
    }

    const classListHtml =
      createClassSelectHtml(
        allClasses,
        classInfo.id
      );

    const generatedAt =
      new Date().toISOString();

    const resultHtml = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>${escapeHtml(classInfo.name)}</title>
</head>
<body>
  <div
    id="timetable-metadata"
    data-class-id="${escapeHtml(classInfo.id)}"
    data-class-name="${escapeHtml(classInfo.name)}"
    data-generated-at="${generatedAt}"
  ></div>

  ${classListHtml}

  ${timetableHtml}
</body>
</html>`;

    const outputPath = path.join(
      DATA_DIRECTORY,
      `${classInfo.id}.html`
    );

    await fs.writeFile(
      outputPath,
      resultHtml,
      "utf8"
    );
  } catch (error) {
    await saveErrorInformation(
      page,
      classInfo,
      error
    );

    throw error;
  } finally {
    await page.close();
  }
}

async function createPage(browser) {
  return browser.newPage({
    locale: "he-IL",
    viewport: {
      width: 1440,
      height: 1000
    }
  });
}

async function openSchoolPage(page) {
  await page.goto(SCHOOL_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  if (page.url().includes("Error500.htm")) {
    throw new Error(
      "The initial school page returned Error500"
    );
  }
}

function createClassSelectHtml(
  classes,
  selectedClassId
) {
  const options = classes
    .map((classInfo) => {
      const selected =
        classInfo.id === selectedClassId
          ? " selected"
          : "";

      return (
        `<option value="${escapeHtml(classInfo.id)}"` +
        `${selected}>` +
        `${escapeHtml(classInfo.name)}` +
        `</option>`
      );
    })
    .join("\n");

  /*
   * Keep the original selector ID because the frontend
   * already searches for this element in the downloaded HTML.
   */
  return `
<select id="dnn_ctr17993_TimeTableView_ClassesList">
${options}
</select>`;
}

async function saveClassesFile(classes) {
  const outputPath = path.join(
    DATA_DIRECTORY,
    "classes.json"
  );

  const data = {
    updatedAt: new Date().toISOString(),
    classes
  };

  await fs.writeFile(
    outputPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

async function saveStatusFile(results) {
  const outputPath = path.join(
    DATA_DIRECTORY,
    "status.json"
  );

  const data = {
    updatedAt: new Date().toISOString(),
    total: results.length,
    successful: results.filter(
      (result) => result.success
    ).length,
    failed: results.filter(
      (result) => !result.success
    ).length,
    results
  };

  await fs.writeFile(
    outputPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

async function saveErrorInformation(
  page,
  classInfo,
  error
) {
  const safeId = classInfo.id.replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  );

  try {
    await page.screenshot({
      path: path.join(
        ERROR_DIRECTORY,
        `${safeId}.png`
      ),
      fullPage: true
    });
  } catch (screenshotError) {
    console.error(
      "Could not save error screenshot:",
      screenshotError.message
    );
  }

  try {
    const errorDetails = {
      classId: classInfo.id,
      className: classInfo.name,
      url: page.url(),
      error: error.message,
      time: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(
        ERROR_DIRECTORY,
        `${safeId}.json`
      ),
      JSON.stringify(errorDetails, null, 2),
      "utf8"
    );
  } catch (writeError) {
    console.error(
      "Could not save error details:",
      writeError.message
    );
  }
}

function removeDuplicateClasses(classes) {
  const seen = new Set();

  return classes.filter((classInfo) => {
    if (seen.has(classInfo.id)) {
      return false;
    }

    seen.add(classInfo.id);
    return true;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

main().catch((error) => {
  console.error("");
  console.error("Scraper stopped:", error);
  process.exitCode = 1;
});
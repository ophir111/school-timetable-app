const SCHOOL_URL = "https://gymnasia.iscool.co.il/";

export default async (request) => {
  const requestUrl = new URL(request.url);

  try {
    const classId =
      requestUrl.searchParams.get("classId") || "22";

    if (!/^\d+$/.test(classId)) {
      return new Response("Invalid class ID", {
        status: 400,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    const firstResponse = await fetch(SCHOOL_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 Chrome/150 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8"
      },
      redirect: "follow"
    });

    if (!firstResponse.ok) {
      throw new Error(
        `First school request returned ${firstResponse.status}`
      );
    }

    const firstHtml = await firstResponse.text();

    const viewState = getValue(
      firstHtml,
      "__VIEWSTATE"
    );

    const viewStateGenerator = getValue(
      firstHtml,
      "__VIEWSTATEGENERATOR"
    );

    const eventValidation = getValue(
      firstHtml,
      "__EVENTVALIDATION"
    );

    if (!viewState) {
      throw new Error("__VIEWSTATE was not found");
    }

    if (!eventValidation) {
      throw new Error(
        "__EVENTVALIDATION was not found"
      );
    }

    const formData = new URLSearchParams();

    formData.set(
      "__EVENTTARGET",
      "dnn$ctr17993$TimeTableView$btnChangesTable"
    );

    formData.set("__EVENTARGUMENT", "");
    formData.set("__LASTFOCUS", "");
    formData.set("__VIEWSTATE", viewState);

    formData.set(
      "__VIEWSTATEGENERATOR",
      viewStateGenerator
    );

    formData.set(
      "__EVENTVALIDATION",
      eventValidation
    );

    formData.set(
      "dnn$ctr17993$TimeTableView$ClassesList",
      classId
    );

    formData.set(
      "dnn$ctr17993$TimeTableView$MainControl$WeekShift",
      "0"
    );

    formData.set(
      "dnn$ctr17993$TimeTableView$ControlId",
      "8"
    );

    formData.set("ScrollTop", "");
    formData.set("__dnnVariable", "");

    const secondResponse = await fetch(SCHOOL_URL, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 Chrome/150 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
        "Content-Type":
          "application/x-www-form-urlencoded",
        "Origin": "https://gymnasia.iscool.co.il",
        "Referer": SCHOOL_URL
      },
      body: formData.toString(),
      redirect: "follow"
    });

    const html = await secondResponse.text();

    if (secondResponse.url.includes("Error500.htm")) {
      throw new Error(
        "School website returned its Error500 page"
      );
    }

    if (!html.includes("TTTable")) {
      throw new Error(
        `Timetable was not found. ` +
        `Status: ${secondResponse.status}, ` +
        `URL: ${secondResponse.url}, ` +
        `length: ${html.length}`
      );
    }

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control":
          "public, max-age=120, s-maxage=120"
      }
    });
  } catch (error) {
    console.error("Timetable function error:", error);

    return new Response(
      `Timetable error: ${error.message}`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      }
    );
  }
};

function getValue(html, id) {
  const inputRegex = new RegExp(
    `<input[^>]*id=["']${escapeRegExp(id)}["'][^>]*>`,
    "i"
  );

  const inputTag = html.match(inputRegex)?.[0];

  if (!inputTag) {
    return "";
  }

  const valueMatch = inputTag.match(
    /value=["']([^"']*)["']/i
  );

  return valueMatch
    ? decodeHtml(valueMatch[1])
    : "";
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
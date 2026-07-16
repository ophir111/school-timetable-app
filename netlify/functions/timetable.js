const makeFetchCookie = require("fetch-cookie").default;
const { CookieJar } = require("tough-cookie");

const SCHOOL_URL = "https://gymnasia.iscool.co.il/";

exports.handler = async function (event) {
  try {
    const classId =
      event.queryStringParameters?.classId || "22";

    if (!/^\d+$/.test(classId)) {
      return textResponse(400, "Invalid class ID");
    }

    const cookieJar = new CookieJar();

    // Keep cookies between the first GET and the POST.
    const fetchWithCookies = makeFetchCookie(
      global.fetch,
      cookieJar
    );

    /*
     * First request:
     * establish the ASP.NET session and retrieve the
     * current VIEWSTATE and EVENTVALIDATION values.
     */
    const firstResponse = await fetchWithCookies(
      SCHOOL_URL,
      {
        method: "GET",
        headers: browserHeaders(),
        redirect: "follow"
      }
    );

    if (!firstResponse.ok) {
      throw new Error(
        `Initial request returned ${firstResponse.status}`
      );
    }

    const firstHtml = await firstResponse.text();

    const viewState = getInputValue(
      firstHtml,
      "__VIEWSTATE"
    );

    const viewStateGenerator = getInputValue(
      firstHtml,
      "__VIEWSTATEGENERATOR"
    );

    const eventValidation = getInputValue(
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

    /*
     * The working browser request uses multipart/form-data.
     * FormData generates the correct boundary automatically.
     */
    const formData = new FormData();

    formData.append(
      "__EVENTTARGET",
      "dnn$ctr17993$TimeTableView$btnChangesTable"
    );

    formData.append("__EVENTARGUMENT", "");
    formData.append("__LASTFOCUS", "");
    formData.append("__VIEWSTATE", viewState);

    formData.append(
      "__VIEWSTATEGENERATOR",
      viewStateGenerator
    );

    formData.append(
      "__EVENTVALIDATION",
      eventValidation
    );

    formData.append(
      "dnn$ctr17993$TimeTableView$ClassesList",
      classId
    );

    /*
     * This must be empty. The previous code incorrectly
     * submitted the value 8.
     */
    formData.append(
      "dnn$ctr17993$TimeTableView$ControlId",
      ""
    );

    formData.append("ScrollTop", "");
    formData.append("__dnnVariable", "");

    /*
     * Do not manually set Content-Type here.
     * fetch() must generate the multipart boundary itself.
     */
    const secondResponse = await fetchWithCookies(
      SCHOOL_URL,
      {
        method: "POST",
        headers: {
          ...browserHeaders(),
          "Cache-Control": "max-age=0",
          Origin: "https://gymnasia.iscool.co.il",
          Referer: SCHOOL_URL
        },
        body: formData,
        redirect: "follow"
      }
    );

    const html = await secondResponse.text();

    if (
      secondResponse.url.includes("Error500.htm")
    ) {
      throw new Error(
        "School website returned its Error500 page"
      );
    }

    if (!html.includes("TTTable")) {
      throw new Error(
        [
          "Timetable was not found.",
          `Status: ${secondResponse.status}.`,
          `Final URL: ${secondResponse.url}.`,
          `Response length: ${html.length}.`,
          `VIEWSTATE length: ${viewState.length}.`,
          `EVENTVALIDATION length: ${eventValidation.length}.`
        ].join(" ")
      );
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control":
          "public, max-age=120, s-maxage=120"
      },
      body: html
    };
  } catch (error) {
    console.error("Timetable function error:", error);

    return textResponse(
      500,
      `Timetable error: ${error.message}`
    );
  }
};

function browserHeaders() {
  return {
    Accept:
      "text/html,application/xhtml+xml," +
      "application/xml;q=0.9,image/avif," +
      "image/webp,image/apng,*/*;q=0.8",

    "Accept-Language":
      "he-IL,he;q=0.9,en-GB;q=0.8," +
      "en;q=0.7,en-US;q=0.6",

    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/150.0.0.0 Safari/537.36",

    "Upgrade-Insecure-Requests": "1"
  };
}

function getInputValue(html, id) {
  const escapedId = escapeRegExp(id);

  const inputPattern = new RegExp(
    `<input\\b(?=[^>]*\\bid=["']${escapedId}["'])[^>]*>`,
    "i"
  );

  const inputTag = html.match(inputPattern)?.[0];

  if (!inputTag) {
    return "";
  }

  const valueMatch = inputTag.match(
    /\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)')/i
  );

  const value =
    valueMatch?.[1] ??
    valueMatch?.[2] ??
    "";

  return decodeHtml(value);
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body
  };
}
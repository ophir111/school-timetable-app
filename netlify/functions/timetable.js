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

    // This follows the same process as the working Render server.
    const firstResponse = await fetch(SCHOOL_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!firstResponse.ok) {
      throw new Error(
        `First school request returned ${firstResponse.status}`
      );
    }

    const firstHtml = await firstResponse.text();

    function getValue(id) {
      const regex = new RegExp(
        `id="${escapeRegExp(id)}" value="([^"]*)"`
      );

      const match = firstHtml.match(regex);
      return match ? match[1] : "";
    }

    const viewState = getValue("__VIEWSTATE");
    const viewStateGenerator =
      getValue("__VIEWSTATEGENERATOR");

    if (!viewState) {
      throw new Error("__VIEWSTATE was not found");
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
        "User-Agent": "Mozilla/5.0",
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    const html = await secondResponse.text();

    if (secondResponse.url.includes("Error500.htm")) {
      throw new Error(
        "School website returned its Error500 page"
      );
    }

    if (!html.includes("TTTable")) {
      throw new Error(
        `Timetable was not found. Response length: ${html.length}`
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

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
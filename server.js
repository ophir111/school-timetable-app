const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors());

app.get("/timetable", async (req, res) => {
  try {
    const url = "https://gymnasia.iscool.co.il/";

    const firstResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const firstHtml = await firstResponse.text();

    function getValue(id) {
      const regex = new RegExp(`id="${id}" value="([^"]*)"`);
      const match = firstHtml.match(regex);
      return match ? match[1] : "";
    }

    const formData = new URLSearchParams();
    formData.set("__EVENTTARGET", "dnn$ctr17993$TimeTableView$btnChangesTable");
    formData.set("__EVENTARGUMENT", "");
    formData.set("__LASTFOCUS", "");
    formData.set("__VIEWSTATE", getValue("__VIEWSTATE"));
    formData.set("__VIEWSTATEGENERATOR", getValue("__VIEWSTATEGENERATOR"));
    const classId = req.query.classId || "22";
    formData.set("dnn$ctr17993$TimeTableView$ClassesList", classId);    formData.set("dnn$ctr17993$TimeTableView$MainControl$WeekShift", "0");
    formData.set("dnn$ctr17993$TimeTableView$ControlId", "8");
    formData.set("ScrollTop", "");
    formData.set("__dnnVariable", "");

    const secondResponse = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const html = await secondResponse.text();

    console.log("HTML length:", html.length);
    console.log("Contains TTTable:", html.includes("TTTable"));

    res.send(html);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch timetable");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
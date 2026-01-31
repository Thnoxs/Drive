const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "HEAD"],
    credentials: true,
  }),
);

// --- SERVICE ACCOUNT SETUP ---
// Ensure drive-player-bot.json is in the same folder or uploaded to Render Secret Files
const KEYFILEPATH = path.join(__dirname, "drive-player-bot.json");

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const drive = google.drive({ version: "v3", auth });

app.get("/", (req, res) => {
  res.send("Drive Player Backend (Service Account) is Ready 🚀");
});

// --- NEW: API TO LIST FILES (Replaces Frontend API Key) ---
app.get("/api/list/:folderId", async (req, res) => {
  try {
    const q = `'${req.params.folderId}' in parents and trashed = false`;
    const response = await drive.files.list({
      q: q,
      fields: "files(id, name, mimeType)",
      orderBy: "folder,name",
    });
    res.json(response.data);
  } catch (error) {
    console.error("List Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- NEW: API TO GET COURSE NAME (For Shared Links) ---
app.get("/api/meta/:fileId", async (req, res) => {
  try {
    const response = await drive.files.get({
      fileId: req.params.fileId,
      fields: "name",
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- VIDEO STREAMING ---
app.get("/stream/:fileId", async (req, res) => {
  const fileId = req.params.fileId;
  const range = req.headers.range;

  try {
    const metadata = await drive.files.get({
      fileId: fileId,
      fields: "size, name, mimeType",
    });
    const fileSize = parseInt(metadata.data.size);
    const mimeType = metadata.data.mimeType || "video/mp4";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": mimeType,
      });

      const stream = await drive.files.get(
        { fileId: fileId, alt: "media" },
        { responseType: "stream", headers: { Range: `bytes=${start}-${end}` } },
      );
      stream.data.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
      });
      const stream = await drive.files.get(
        { fileId: fileId, alt: "media" },
        { responseType: "stream" },
      );
      stream.data.pipe(res);
    }
  } catch (error) {
    if (error.code !== "ECONNABORTED") res.status(500).end();
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: edit; share-sheet-inputs: file-url, url, image;

// ngrok (localhost) version
// const webhookUrl = "https://c58f-76-22-26-231.ngrok-free.app/webhook";

// Render version
const webhookUrl = "https://tibls-recipe-generator-ptm9.onrender.com/webhook";

// Default schema values
let input = "";
let filename = "";
let imageFormat = "";

// Shared URL or text
if (args.urls.length > 0) {
  input = args.urls[0].toString();
} else if (args.plainTexts.length > 0) {
  input = args.plainTexts[0];
}

// Shared file (e.g. PDF, image from Files)
else if (args.fileURLs.length > 0) {
  let file = args.fileURLs[0];
  let fm = FileManager.iCloud();

  if (!fm.isFileDownloaded(file.path)) {
    await fm.downloadFileFromiCloud(file.path);
  }

  let data = fm.read(file);
  base64 = data.toBase64String();
  filename = file.name;
}

// 3️⃣ Shared image (e.g. from Photos app)
else if (args.images.length > 0) {
  let img = args.images[0];
  base64 = Data.fromJPEG(img).toBase64String(); // Convert to JPEG
  filename = "image.jpg";
}

// Construct schema-consistent payload
const payload = {
  input,
  filename,
  imageFormat
};
let req = new Request(webhookUrl);
req.method = "POST";
req.headers = { "Content-Type": "application/json" };
req.body = JSON.stringify(payload);

let response; // Declare it here so it's accessible in catch
try {
  const raw = await req.loadString();
  response = JSON.parse(raw);

  if (response.error) {
    const alert = new Alert();
    alert.title = "❌ Failed!";
    alert.message = response.error;
    await alert.present();
  } else {
    const alert = new Alert();
    alert.title = "✅ Sent!";
    alert.message = `Viewer:\n${response.viewer}`;
    await alert.present();

    if (response.viewer) Safari.openInApp(response.viewer);
  }


} catch (e) {
  const alert = new Alert();
  alert.title = "❌ Failed!";
  alert.message = `${e.toString()}\n\nWebhook at ${webhookUrl} response:\n${response}`;
  await alert.present();
}
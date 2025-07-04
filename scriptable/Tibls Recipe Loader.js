// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: edit; share-sheet-inputs: file-url, url, image;

// ngrok (localhost) version
// let baseUrl = "https://442e-50-237-200-190.ngrok-free.app"

// Render version
let baseUrl = "https://tibls-recipe-generator-ptm9.onrender.com";
const inShareSheetMode = args.plainTexts || args.urls || args.images || args.fileURLs

if (!inShareSheetMode) {
  // Just open baseUrl in a Safari tab
  Safari.open(baseUrl);
  return;
} 
else {
  // Script is being invoked via Share Sheet
  // baseUrl is a webhook; append "/webhook" to it
  baseUrl = `${baseUrl}/webhook`;

  // Default schema values
  let input = "";
  let filename = "";
  let filetype = "";
  let base64 = "";

  // 1️⃣ Shared URL or text
  if (args.urls.length > 0) {
    input = args.urls[0].toString();
  } else if (args.plainTexts.length > 0) {
    input = args.plainTexts[0];
  }

  // 2️⃣ Shared file (e.g. PDF, image from Files)
  else if (args.fileURLs.length > 0) {
    let file = args.fileURLs[0];
    let fm = FileManager.iCloud();

    if (!fm.isFileDownloaded(file.path)) {
      await fm.downloadFileFromiCloud(file.path);
    }

    let data = fm.read(file);
    base64 = data.toBase64String();
    filename = file.name;
    filetype = file.name.split(".").pop().toLowerCase();
  }

  // 3️⃣ Shared image (e.g. from Photos app)
  else if (args.images.length > 0) {
    let img = args.images[0];
    base64 = Data.fromJPEG(img).toBase64String(); // Convert to JPEG
    filename = "image.jpg";
    filetype = "jpg";
  }

  // Construct schema-consistent payload
  const payload = {
    input,
    filename,
    filetype,
    base64
  };
  let req = new Request(baseUrl);
  req.method = "POST";
  req.headers = { "Content-Type": "application/json" };
  req.body = JSON.stringify(payload);

  let response; // Declare it here so it's accessible in catch
  try {
    const raw = await req.loadString();
    response = JSON.parse(raw);

    const alert = new Alert();
    alert.title = "✅ Sent!";
    alert.message = `Viewer:\n${response.viewer}`;
    await alert.present();

    if (response.viewer) Safari.openInApp(response.viewer);

  } catch (e) {
    const alert = new Alert();
    alert.title = "❌ Failed!";
    alert.message = `${e.toString()}\n\nWebhook at ${baseUrl} response:\n${response}`;
    await alert.present();
  }
}
// PullFromRepo.js
const DefaultRepo = "billbliss/tibls-recipe-generator";
const DefaultPath = "scriptable/Tibls Recipe Loader.js";
const DefaultBranch = "main";

let [repo, path, runAfter, branch] = args.plainTexts;

repo = repo || DefaultRepo;
path = path || DefaultPath;
branch = branch || DefaultBranch;
runAfter = runAfter || "false"; // Default to not running the script after sync

const token = Keychain.get("GitHubToken");
if (!token) throw new Error("GitHub token not found in Keychain");

const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
let req = new Request(rawUrl);
req.headers = {
  Authorization: `token ${token}`,
  "User-Agent": "Scriptable"
};
let content = await req.loadString();

let fm = FileManager.iCloud();
let filename = path.split("/").pop();
let localPath = fm.joinPath(fm.documentsDirectory(), filename);
fm.writeString(localPath, content);

// Wait for sync to iCloud if needed
if (!fm.isFileDownloaded(localPath)) {
  await fm.downloadFileFromiCloud(localPath);
}

console.log(`Updated ${filename} from GitHub repo ${repo}`);

if (runAfter === "true") {
  Safari.open(`scriptable:///run?scriptName=${encodeURIComponent(filename.replace(/\.js$/, ""))}`);
}
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
const key = "GitHubToken"; // Key to store the token in settings
const githubToken = ""; // Generate at github.com/settings/tokens

// Set a value in the settings
Keychain.set(key, githubToken);

// Get the value from the settings
const tokenValue = Keychain.get(key);

// Log the result
console.log(`Token: ${tokenValue}`);

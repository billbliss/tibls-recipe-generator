// GitHub classic Personal Access Token
const key = "GitHubToken"; 

// Remove settings values
Keychain.remove(key);
console.log(`Removed setting for key: ${key}`);
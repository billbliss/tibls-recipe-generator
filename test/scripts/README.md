# Running this script

From the project root, run:

```bash
npx ts-node test/scripts/compare-recipes.ts
```

# Folder Structure

- `test/fixtures/tibls-starter-recipes/` → committed local recipe JSON fixtures used by `compare-recipes.ts`
- `test/scripts/compare-recipes.ts` → this script
- `debug/chatgpt/` → ChatGPT API request/response logs (gitignored)

The script compares local fixture recipes against live server responses and logs differences.

# Debugging this script

Debugging this script requires launch.json magic. Here's the .vscode/launch.json file - it defines a compound configuration called "Debug Server + Compare Recipes" that lets you debug the server routes _and_ run the compare-recipes script, setting breakpoints in either:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug with ts-node-dev",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/ts-node-dev",
      "runtimeArgs": ["--respawn", "--transpile-only", "server.ts"],
      "cwd": "${workspaceFolder}",
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug compiled dist/server.js",
      "program": "${workspaceFolder}/dist/server.js",
      "preLaunchTask": "tsc: build - tsconfig.json",
      "cwd": "${workspaceFolder}",
      "envFile": "${workspaceFolder}/.env",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug compare-recipes.ts",
      "preLaunchTask": "wait-for-server",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/ts-node",
      "runtimeArgs": ["--transpile-only", "${workspaceFolder}/test/scripts/compare-recipes.ts"],
      "cwd": "${workspaceFolder}",
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ],
  "compounds": [
    {
      "name": "Debug Server + Compare Recipes",
      "configurations": ["Debug with ts-node-dev", "Debug compare-recipes.ts"]
    }
  ]
}
```

You also need a .vscode/tasks.json file with the following (referenced above):

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "wait-for-server",
      "type": "shell",
      "command": "sleep",
      "args": ["3"],
      "problemMatcher": []
    }
  ]
}
```
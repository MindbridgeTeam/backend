# Python Assistant Source

These are the original Python files supplied for the assistant. They are kept here unchanged as source/reference files.

The deployed Firebase Functions codebase runs Node.js and TypeScript. It does not execute Python from this folder. The equivalent local assistant logic used by Firebase Functions is in `functions/src/chat/assistant.ts` and is called by `functions/src/chat/index.ts`.

Do not deploy this folder as a second assistant runtime unless the backend is intentionally migrated to Python.

# Security

## Reporting

Please report security issues privately through GitHub Security Advisories after the repository is published. Do not include API keys, private workspace files, or other personal project data in a public issue.

## Local data

- Workspace files stay under the configured local workspace root.
- API keys are encrypted with Electron `safeStorage` and are not written into the workspace.
- `workspace/`, `.env*`, build output, and runtime request files are excluded from Git.

## Supported runtime

Los Alamos currently supports Node.js 20.19 or newer and Electron 39.

The remaining development-only `npm audit` finding is in Electron's download-time `extract-zip` dependency. It is not shipped inside the packaged application. Electron 40+ removes that dependency but requires Node.js 22.12; the project will take that upgrade when its minimum Node runtime is raised.

Production dependencies can be checked with:

```bash
npm audit --omit=dev
```

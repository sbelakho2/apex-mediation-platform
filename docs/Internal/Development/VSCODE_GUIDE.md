# VS Code Development Guide

This guide explains how to use VS Code as the central development hub for the entire ApexMediation Platform (backend, website, and all systems).

## Quick Start

1. **Open this workspace** in VS Code
2. **Install recommended extensions** when prompted (or run: `code --install-extension <extension-id>`)
3. **Run a task**: Press `Cmd+Shift+P` → "Tasks: Run Task" → Select task
4. **Start coding!**

---

## Available Tasks

Press `Cmd+Shift+P` → "Tasks: Run Task" to access all tasks.

### 🚀 Development Tasks

| Task | Description | Shortcut |
|------|-------------|----------|
| **🚀 Start Full Stack** | Starts backend + website together | Recommended for full-stack development |
| **🔐 Start Full Stack (Secure)** | Same but with Infisical secrets | Use for production-like testing |
| **🚀 Start Backend (Development)** | Starts Node.js backend only | Port 4000 |
| **🌐 Start Website (Development)** | Starts Next.js website only | Port 3000 |

**Pro Tip**: Set up keyboard shortcuts for frequently used tasks:
1. `Cmd+Shift+P` → "Preferences: Open Keyboard Shortcuts (JSON)"
2. Add:
```json
[
  {
    "key": "cmd+shift+b",
    "command": "workbench.action.tasks.runTask",
    "args": "🚀 Start Full Stack"
  }
]
```

### 📊 Database Tasks

| Task | Description |
|------|-------------|
| **📊 Start All Databases** | Starts PostgreSQL, ClickHouse, Redis (Docker) |
| **🛑 Stop All Databases** | Stops all database containers |
| **🗄️ Run Database Migrations** | Applies all pending migrations |
| **🔐 Run Database Migrations (Production)** | Applies migrations to production DB |

### 🧪 Testing Tasks

| Task | Description | Shortcut |
|------|-------------|----------|
| **🧪 Run Backend Tests** | Runs Jest tests | `Cmd+Shift+T` (default test shortcut) |
| **🧪 Run Website Tests** | Runs Vitest tests | - |
| **🎭 Run E2E Tests (Playwright)** | Full browser automation tests | - |

### 🏗️ Build Tasks

| Task | Description |
|------|-------------|
| **🏗️ Build Backend** | Compiles TypeScript to JavaScript |
| **🏗️ Build Website** | Builds Next.js for production |
| **🧹 Clean Backend Build** | Removes dist/ and rebuilds |
| **🧹 Clean Website Build** | Removes .next/ and rebuilds |

### 🚀 Deployment Tasks

| Task | Description |
|------|-------------|
| **🚀 Deploy Backend to Production** | Pushes to `main` branch (triggers CI/CD) |
| **🚀 Deploy Website to Vercel** | Direct deployment via Vercel CLI |

### 🔐 Security Tasks

| Task | Description |
|------|-------------|
| **🔐 Migrate Secrets to Infisical** | One-time migration from .env to Infisical |

### 🔍 Maintenance Tasks

| Task | Description |
|------|-------------|
| **📦 Install All Dependencies** | Runs `npm install` in backend and website |
| **🔍 Lint Backend** | Runs ESLint on backend code |
| **🔍 Lint Website** | Runs ESLint on website code |
| **🔍 Check System Status** | Shows running processes and Docker containers |
| **📈 Open Backend Logs** | Tails backend log file |

---

## Debugging

### Debug Backend

1. Set breakpoints in backend code (click left gutter)
2. Press `F5` or go to Run & Debug panel (Cmd+Shift+D)
3. Select "🚀 Debug Backend"
4. Click green play button

**Features**:
- ✅ Hot reload (code changes apply automatically)
- ✅ Inspect variables
- ✅ Step through code
- ✅ Evaluate expressions

### Debug Website

1. Start website with task: "🌐 Start Website (Development)"
2. Set breakpoints in website code
3. Press `F5` → Select "🌐 Debug Website (Chrome)"
4. Chrome will open with debugger attached

**Features**:
- ✅ Debug both client-side and server-side code
- ✅ React DevTools integration
- ✅ Network inspection

### Debug Full Stack

1. Press `F5` → Select "🚀 Debug Full Stack"
2. Both backend and website will start in debug mode
3. Set breakpoints in either codebase

---

## Recommended Extensions

VS Code will prompt you to install recommended extensions. Here's what each does:

### Language Support
- **ESLint** - Real-time linting for TypeScript/JavaScript
- **Prettier** - Code formatting on save
- **TypeScript** - Enhanced TypeScript support

### Framework & Tools
- **Tailwind CSS IntelliSense** - Autocomplete for Tailwind classes
- **Playwright** - E2E test runner integration

### Database
- **SQLTools** - Run SQL queries directly in VS Code
- **PostgreSQL** - Syntax highlighting and autocomplete for SQL

### Git & Collaboration
- **GitLens** - Enhanced Git features (blame, history, compare)

### Documentation
- **Markdown All in One** - Enhanced markdown editing
- **Markdown Lint** - Markdown style checking

### Productivity
- **Error Lens** - Inline error/warning display
- **Better Comments** - Color-coded comments (! for important, ? for questions, etc.)
- **Todo Highlight** - Highlights TODO, FIXME, NOTE comments

### Security
- **Infisical** - Secrets management integration

---

## Keyboard Shortcuts

### Essential Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+P` | Command Palette (run any command) |
| `Cmd+P` | Quick file open |
| `Cmd+Shift+F` | Search across all files |
| `Cmd+Shift+T` | Run tests |
| `F5` | Start debugging |
| `Shift+F5` | Stop debugging |
| `Cmd+Shift+B` | Build project |
| `Cmd+Shift+D` | Open Debug panel |
| `Cmd+J` | Toggle terminal |
| `Cmd+B` | Toggle sidebar |
| `Cmd+\` | Split editor |

### Custom Shortcuts (Configured)

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+B` | Start Full Stack |

**Customize More**: `Cmd+Shift+P` → "Preferences: Open Keyboard Shortcuts"

---

## Database Management

### Connect to PostgreSQL

1. Click **SQLTools** icon in sidebar (database icon)
2. Select "ApexMediation - Development" connection
3. Enter password: `postgres`
4. Run queries:
   - Right-click table → "Show Table Records"
   - Create new SQL file → Execute with `Cmd+E Cmd+E`

### Common SQL Queries

```sql
-- Check all tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';

-- View recent transactions
SELECT * FROM transaction_log
ORDER BY created_at DESC
LIMIT 10;

-- Check app revenue
SELECT app_id, SUM(amount_eur) as total_revenue
FROM transaction_log
WHERE transaction_type = 'revenue'
GROUP BY app_id
ORDER BY total_revenue DESC;
```

---

## Git Workflow

### GitLens Features

- **Line Blame**: See who changed each line (inline)
- **File History**: View all changes to a file
- **Compare**: Compare current vs. previous versions
- **Git Graph**: Visualize branch history

### Common Git Commands in VS Code

1. **Stage Changes**: Click `+` next to file in Source Control panel
2. **Commit**: Enter message, click checkmark
3. **Push**: Click `...` → "Push"
4. **Pull**: Click `...` → "Pull"
5. **Create Branch**: Click branch name in status bar → "Create new branch"
6. **Switch Branch**: Click branch name → Select branch

---

## Environment Variables

### Development

Use `.env` file (backend) or `.env.local` (website):

```bash
# backend/.env
DATABASE_URL=postgresql://localhost:5432/apexmediation
JWT_SECRET=your-secret-here
```

### Production (Infisical)

1. Run task: "🔐 Migrate Secrets to Infisical"
2. Log in to [Infisical Dashboard](https://app.infisical.com)
3. Add/edit secrets
4. Secrets auto-sync to production on save

### Viewing Current Secrets

```bash
cd backend
infisical secrets list --env=development
```

---

## Testing Workflow

### Unit Tests (Jest/Vitest)

**Run all tests**:
- Backend: Task → "🧪 Run Backend Tests"
- Website: Task → "🧪 Run Website Tests"

**Run specific test file**:
1. Open test file
2. Click "Run" above test function (CodeLens)

**Watch mode** (auto-run on file save):
```bash
cd backend && npm run test:watch
```

### E2E Tests (Playwright)

**Run all E2E tests**:
- Task → "🎭 Run E2E Tests (Playwright)"

**Run specific test**:
```bash
cd website
npx playwright test tests/auth.spec.ts
```

**Debug E2E test**:
```bash
npx playwright test --debug
```

### Test Coverage

```bash
cd backend
npm run test:coverage
# Open: backend/coverage/lcov-report/index.html
```

---

## Deployment from VS Code

### Deploy Backend

**Method 1: Git Push (Recommended)**
- Task → "🚀 Deploy Backend to Production"
- This pushes to `main` branch, triggering GitHub Actions

**Method 2: Manual**
```bash
cd backend
git checkout main
git pull origin main
git merge develop
git push origin main
```

### Deploy Website

**Method 1: Vercel CLI**
- Task → "🚀 Deploy Website to Vercel"

**Method 2: Git Push**
```bash
cd website
git checkout main
git push origin main
# Vercel auto-deploys
```

**Preview Deploy** (for testing):
```bash
cd website
vercel
# Get preview URL
```

---

## Troubleshooting

### Port Already in Use

**Error**: `EADDRINUSE: address already in use :::4000`

**Solution**:
```bash
# Find process using port 4000
lsof -ti:4000

# Kill process
kill -9 $(lsof -ti:4000)

# Or use task: "🔍 Check System Status" to see all processes
```

### Database Connection Failed

**Error**: `connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
- Task → "📊 Start All Databases"
- Or manually: `docker start postgres`

### TypeScript Errors in VS Code

**Issue**: Red squiggly lines everywhere

**Solution**:
1. Reload TypeScript Server: `Cmd+Shift+P` → "TypeScript: Reload Project"
2. Reinstall dependencies: Task → "📦 Install All Dependencies"
3. Restart VS Code

### Extension Not Working

**Issue**: ESLint/Prettier not formatting on save

**Solution**:
1. Install extension: Check `.vscode/extensions.json`
2. Reload VS Code: `Cmd+Shift+P` → "Developer: Reload Window"
3. Check settings: `.vscode/settings.json`

---

## Performance Tips

### Speed Up VS Code

1. **Exclude folders from search**:
   - Already configured in `.vscode/settings.json`
   - Excludes: `node_modules`, `dist`, `.next`

2. **Disable unused extensions**:
   - `Cmd+Shift+X` → Disable extensions you don't use

3. **Close unused tabs**:
   - `Cmd+Shift+P` → "View: Close All Editors"

### Large Project Tips

- **Use multi-root workspaces**: Organize backend/website as separate roots
- **Split terminal**: `Cmd+\` in terminal panel
- **Use breadcrumbs**: Navigate file structure at top of editor

---

## Collaboration

### Live Share (Pair Programming)

1. Install "Live Share" extension
2. Click "Live Share" in status bar
3. Share link with teammate
4. They can:
   - Edit code together
   - Follow your cursor
   - Share terminal
   - Debug together

### Code Reviews

**Using GitHub Integration**:
1. Install "GitHub Pull Requests" extension
2. View PRs in sidebar
3. Review code without leaving VS Code
4. Comment, approve, request changes

---

## Workspace Organization

### Recommended Layout

```
┌─────────────────────────────────────┐
│ Explorer | Tabs                     │
├──────────┼──────────────────────────┤
│          │                          │
│ Files    │   Code Editor            │
│ Tree     │   (Split view)           │
│          │                          │
├──────────┴──────────────────────────┤
│ Terminal (Backend | Website | Git) │
└─────────────────────────────────────┘
```

**Set up**:
1. Open Explorer (Cmd+Shift+E)
2. Split editor (Cmd+\)
3. Open terminal (Cmd+J)
4. Split terminal (Click `+` dropdown → "Split Terminal")

### Workspace Files

| File | Purpose |
|------|---------|
| `.vscode/tasks.json` | Custom tasks |
| `.vscode/launch.json` | Debug configurations |
| `.vscode/settings.json` | Project settings |
| `.vscode/extensions.json` | Recommended extensions |

**Edit any time**: Open file, make changes, save.

---

## Resources

- **VS Code Docs**: [code.visualstudio.com/docs](https://code.visualstudio.com/docs)
- **Keyboard Shortcuts PDF**: [Download](https://code.visualstudio.com/shortcuts/keyboard-shortcuts-macos.pdf)
- **Extension Marketplace**: [marketplace.visualstudio.com](https://marketplace.visualstudio.com/)

---

## Support

**Issues with VS Code setup?**
- **Internal**: Contact DevOps team
- **External**: [Stack Overflow](https://stackoverflow.com/questions/tagged/visual-studio-code)

---

**Last Updated**: January 2025
**Maintainer**: Development Team

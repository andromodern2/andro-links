# ANDRO — my links site

My personal page: photo, info, and every Telegram channel / group / bot / YouTube link
in one place. English + Arabic, with a full right-to-left layout in Arabic.

**It edits itself.** There is a hidden editor built into the page. I tap the small dot in
the footer, enter my PIN, and I can add channels, rename them, reorder them, change my bio —
then hit **Publish** and the change goes live for everyone. No code, no laptop, no terminal.

---

## How it works

| File | What it does |
|---|---|
| `index.html` | The whole site + the built-in editor |
| `data.json` | All the content (name, bio, channels). **This is the file the editor changes.** |
| `assets/photo.jpg` | My photo |
| `api/verify.js` | Checks my PIN on the server |
| `api/save.js` | Writes `data.json` back to GitHub when I hit Publish |

Publishing works like this:

```
I tap Publish  →  api/save.js checks my PIN  →  it commits data.json to GitHub
              →  Vercel sees the commit and redeploys  →  live for everyone (~30s)
```

Because the PIN is checked **on the server**, it is never written anywhere in the
website's code. Visitors cannot find it by viewing the page source.

---

## Setup (one time)

### 1. Put it on Vercel

1. Go to **vercel.com** → sign in with GitHub
2. **Add New → Project**
3. Pick this repository → **Import**
4. Leave every setting alone → **Deploy**

Done. The site is live. The editor won't publish yet — that needs step 2.

### 2. Make a GitHub token

1. Go to **github.com/settings/personal-access-tokens/new** (Fine-grained token)
2. **Token name:** `andro-site publish`
3. **Expiration:** whatever you prefer (a longer one means less re-doing this)
4. **Repository access** → *Only select repositories* → pick this repo
5. **Permissions** → *Repository permissions* → **Contents** → set to **Read and write**
6. **Generate token** and copy it (it is shown only once)

### 3. Add the two secrets in Vercel

In Vercel: your project → **Settings → Environment Variables**. Add:

| Name | Value |
|---|---|
| `EDIT_PIN` | the PIN you want to unlock editing with |
| `GITHUB_TOKEN` | the token from step 2 |

Then **Deployments → ⋯ → Redeploy** so the new variables are picked up.

That's it. Tap the dot in the footer, enter your PIN, and the editor is live.

---

## Using the editor

- **Get in:** tap the small `•` in the footer (or tap your photo 5 times), then enter the PIN
- **Channels:** add / edit / delete, reorder with ↑ ↓, or move an item to another section
- **About me:** name, bio in English and Arabic separately, info tags
- **Publish:** sends it live for everyone. A red dot on the Edit button means you have
  unpublished changes
- **Security:** hide the edit button again on this device

Unpublished edits are kept on your own device, so you can close the page and come back
to them. Only **Publish** changes what visitors see.

### Changing your PIN

Edit `EDIT_PIN` in Vercel → Settings → Environment Variables, then redeploy.

---

## Custom domain

Vercel → your project → **Settings → Domains → Add**. Follow the DNS instructions it gives you.

---

## Tests

```bash
node test-api.mjs     # the two server functions: PIN checks, GitHub commit, input cleaning
node test-site.mjs    # the page: rendering, editor, drafts, publishing, both languages
```

Both run on plain Node with no dependencies to install.

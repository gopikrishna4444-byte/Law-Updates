# Law Updates – Income Tax · GST · Companies Act

A free Android app that keeps itself updated with the latest **notifications and circulars** from the official websites:

| Law | Official pages checked |
|---|---|
| Income Tax (Act 2025) | incometaxindia.gov.in – Notifications, Circulars |
| GST | cbic-gst.gov.in – Central Tax, Central Tax (Rate), Circulars |
| Companies Act | mca.gov.in – Notifications, Circulars |

The app also has an **Acts** tab with links to the official consolidated text of each Act, and a **source check** that shows whether each site was read successfully.

**Cost: ₹0.** Everything runs on GitHub's free plan. No coding is needed to set it up.

---

## How it works

```
GitHub (free) runs the fetcher twice a day at 7:17 AM and 6:47 PM IST
        │  reads the official pages and finds new notifications/circulars
        ▼
docs/data/updates.json  ←  saved automatically
        │
        ▼
The app on your phone reads that file → shows new items with a red NEW badge
        │
        └─ (optional) a push notification on your phone through the free "ntfy" app
```

---

## One-time setup (about 20 minutes)

### 1. Create a free GitHub account
Go to https://github.com and sign up.

### 2. Put this project on GitHub
1. Click **+** (top right) → **New repository**.
2. Name it, for example `law-updates`.
3. Set it to **Public**. Free GitHub Pages hosting needs a public repository. Only the list of government notifications is public.
4. Click **Create repository**.
5. On the next page, click **"uploading an existing file"**.
6. Unzip `tax-law-updates.zip` on your computer. Drag **everything inside the folder** into the upload box, including the `.github` folder.

   Windows hides folders that start with a dot. If `.github` doesn't upload, switch on **File Explorer → View → Show → Hidden items**, then drag again.
7. Click **Commit changes**.

### 3. Switch on the website that serves the app
1. In your repository, open **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. For the branch, choose `main` and the folder `/docs`, then click **Save**.
4. After about a minute, the page shows your app's address, for example
   `https://your-name.github.io/law-updates/`.

### 4. Allow the automatic updater to save data
1. Open **Settings → Actions → General**.
2. Under **Workflow permissions**, choose **Read and write permissions**, then click **Save**.

### 5. Run the first update now
1. Open the **Actions** tab. If asked, click **"I understand my workflows, go ahead and enable them"**.
2. Click **Fetch latest updates** → **Run workflow** → **Run workflow**.
3. Wait 3–5 minutes until you see a green tick.

After this first run, it repeats automatically twice a day.

### 6. Install it on your Android phone
1. Open your app address in **Chrome** on the phone.
2. Tap **⋮** → **Add to Home screen** → **Install**.

It now opens like a normal app, with its own icon and full screen, and it works offline with the last saved list.

---

## Optional: push notifications on your phone (free)

1. Install the **ntfy** app from the Play Store.
2. In the ntfy app, tap **+** and subscribe to a topic name that only you know, for example `ksrao-law-updates-8317`.
3. On GitHub, go to **Settings → Secrets and variables → Actions**.
   - Click **New repository secret**. Name it `NTFY_TOPIC`. Use your topic name as the value.
   - Optionally, open the **Variables** tab and add `APP_URL` with your app address. Tapping a notification will then open the app.

From the next run onward, you'll get a notification whenever something new is published.

---

## Optional: turn it into a real APK / Play Store app

1. Go to https://www.pwabuilder.com and paste your app address.
2. Click **Package for stores → Android** and download the package.
3. The download includes an `.apk` you can install directly. It also includes an `.aab` you can upload to Google Play; a Play Console developer account costs a one-time fee of about US $25.

The APK shows the same app and stays updated in the same way.

---

## If something stops working

**Check the source health first.** Open the app → **Acts** tab → **Source check**.
- A green dot means the page was read.
- A red dot shows the reason.

**"Page opened but no items were recognised"**
The site probably changed its layout or moved the page.
1. Open `fetcher/sources.json` on GitHub and click the ✏️ pencil icon.
2. Paste the new page address into `url`.
3. Click **Commit changes**.

**Every source fails with a connection error**
Some Indian government sites block servers located outside India, and GitHub's servers are in the USA. If that happens, run the updater from your own computer, which uses Indian internet:

1. Install **Python** from https://python.org. During setup, tick **"Add Python to PATH"**.
2. Install **Git** from https://git-scm.com.
3. Download your repository: in a terminal, run `git clone https://github.com/your-name/law-updates`.
4. In that folder, run once:
   `pip install -r fetcher/requirements.txt` and then `python -m playwright install chromium`
5. Double-click `run_on_my_pc.bat` to test it.
6. Schedule it daily:
   1. Open **Task Scheduler** → **Create Basic Task**.
   2. Set it to **Daily**.
   3. Choose **Start a program** and pick `run_on_my_pc.bat`.

**Add another source** (for example SEBI or ICAI announcements)
Copy one block in `fetcher/sources.json` and change these fields: `id`, `law`, `category`, `url` and `include` (words a relevant link should contain).

**Change the Acts tab links**
Edit `docs/data/acts.json`.

---

## Files

| File | What it is |
|---|---|
| `fetcher/sources.json` | List of official pages to check (edit this, not the code) |
| `fetcher/fetch.py` | The fetcher. Finds notification/circular links, dates and numbers, and keeps only new ones |
| `.github/workflows/update.yml` | Runs the fetcher twice a day on GitHub |
| `docs/` | The app (works on any phone; installable) |
| `docs/data/updates.json` | The collected updates (written automatically) |
| `docs/data/acts.json` | Links in the Acts tab |
| `run_on_my_pc.bat` | Backup: run the fetcher from your own computer |
| `tests/sample_pages/` | Sample pages for testing the fetcher offline: `python fetcher/fetch.py --html-dir tests/sample_pages` |

*This is an unofficial index that links to official government sources. It is for quick reference, not legal advice. Always rely on the official notification text.*

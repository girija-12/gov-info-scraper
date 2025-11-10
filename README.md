# 🏛️ Government Info Portal

A full-stack information aggregation platform that automates the process of collecting, managing, and browsing official notices from multiple government or organizational websites.
It combines a web scraper, Flask-based backend API, and a React frontend to provide a smooth interface for tracking tenders, announcements, and documents across various sources.

## 🔍 What it does
- Scrapes configured organization pages (news, tenders, PDFs) using Selenium.
- Stores notices in a MySQL database.
- Exposes a Flask API for search, manual scrape, email sending, and user auth.
- React frontend for browsing, selecting and emailing notices.

## ⚙️ Quick features
- Periodic background scraping
- Keyword-based search & on-demand scraping
- Email compose/send from selected notices
- Basic user signup / login (password hashed)
- Pluggable parser types for different section layouts

## ✅ Requirements
- Python 3.8+
- Node.js + npm
- Chrome and matching ChromeDriver
- MySQL server

## 🧭 Setup (overview)
1. Clone the project and open the root folder.
2. Create a Python virtual env:
   - Windows:
     ```
     python -m venv .\venv
     .\venv\Scripts\activate
     ```
3. Install backend deps:
   ```
   pip install -r backend/requirements.txt
   ```
   (If no requirements.txt, install Flask, selenium, python-dotenv, mysql-connector-python, etc.)
4. Install frontend deps:
   ```
   cd frontend
   npm install
   ```
   Check package.json for the correct start script (npm start or npm run dev).

## 🔐 Environment variables
Create a `.env` file in `backend/` with:
- DB_HOST — MySQL host (e.g. localhost)
- DB_USER — MySQL user
- DB_PASSWORD — MySQL password
- DB_NAME — database name
- CHROME_DRIVER_PATH — full path to chromedriver.exe
- EMAIL_ADDRESS — sender email
- EMAIL_PASSWORD — sender email password

Frontend (if using Vite) add env vars for Firebase in `frontend/.env`:
- VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID

## ▶️ Run (local)
- Start backend (from project root):
  ```
  cd backend
  .\venv\Scripts\activate
  python scraper_api.py
  ```
  Default: http://localhost:5000

- Start frontend:
  ```
  cd frontend
  npm start   # or npm run dev (check package.json)
  ```
  Default: http://localhost:3000

## 🗄️ Database
Create DB and tables used by the backend. Minimal tables: organizations, sections, notices, users, default_keywords. (Add SQL schema file if needed.)

## 📝 Notes & tips
- Make sure ChromeDriver version matches your Chrome.
- Use python-dotenv to load .env automatically (load_dotenv()).
- If popup auth causes issues, allow popups and ensure Firebase is initialized once.

## 📂 Project structure (high level)
- backend/
  - scraper_api.py — Flask API + scraper
- frontend/
  - src/ — React app
  - src/firebase.js — Firebase config (reads VITE_ env vars)
- README.md — this file

## ❓ Need help?
Open an issue or ask for:
- sample .env or requirements.txt
- SQL schema
- help running scripts or fixing ChromeDriver issues

Happy scraping! 🕸️📩

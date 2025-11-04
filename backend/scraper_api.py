import os
from selenium.webdriver.support.ui import WebDriverWait
from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import threading
from datetime import datetime, timedelta
import time
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

# === DB & Chrome Setup ===
db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'scraper_platform')
}

chrome_driver_path = os.getenv('CHROME_DRIVER_PATH', r"C:\WebDrivers\chromedriver-win64\chromedriver.exe")
options = Options()
options.add_argument("--headless=new")
options.add_argument("--disable-blink-features=AutomationControlled")
options.add_argument("--window-size=1920,1080")

# === Email Settings ===
EMAIL_ADDRESS = os.getenv('EMAIL_ADDRESS')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD')

def get_db():
    return mysql.connector.connect(**db_config)

# === Improved Parsers ===
def parse_carousel(driver):
    elems = driver.find_elements(By.CSS_SELECTOR, "div.carousel-item a, div.carousel-item a.light")
    parsed = [{"title": e.get_attribute("title") or e.text.strip(), "url": e.get_attribute("href")} for e in elems if (e.get_attribute("title") or e.text.strip())]
    print(f"[Parsed: carousel] Found {len(parsed)} items")
    return parsed

def parse_accordion(driver):
    elems = driver.find_elements(By.CSS_SELECTOR, "div.accordion-item a")
    parsed = [{"title": e.get_attribute("title") or e.text.strip(), "url": e.get_attribute("href")} for e in elems if (e.get_attribute("title") or e.text.strip())]
    print(f"[Parsed: accordion] Found {len(parsed)} items")
    return parsed

def parse_students(driver):
    elems = driver.find_elements(By.CSS_SELECTOR, "a[href*='pdf'], a[href*='.html'], a[href^='https'], a")
    parsed = [{"title": e.text.strip(), "url": e.get_attribute("href")} for e in elems if e.text.strip() and e.get_attribute("href")]
    print(f"[Parsed: students] Found {len(parsed)} items")
    return parsed

def parse_tenders(driver):
    elems = driver.find_elements(By.CSS_SELECTOR, "a[href*='.pdf'], table a[href], a")
    parsed = [{"title": e.text.strip(), "url": e.get_attribute("href")} for e in elems if e.text.strip() and e.get_attribute("href")]
    print(f"[Parsed: tenders] Found {len(parsed)} items")
    return parsed

parser_map = {
    "carousel": parse_carousel,
    "accordion": parse_accordion,
    "students": parse_students,
    "tenders": parse_tenders
}

def filter_items(items,keywords):
    filtered = [
        item for item in items
        if item.get("title") and item.get("url") and any(k in item["title"].lower() for k in keywords)
    ]
    print(f"[Filter] {len(filtered)} of {len(items)} passed keyword filter")
    return filtered

# === Parser Detection ===
def detect_parser_type(full_url):
    print(f"[Detect Parser] Trying: {full_url}")
    try:
        driver = webdriver.Chrome(service=Service(chrome_driver_path), options=options)
        driver.set_page_load_timeout(15)
        driver.get(full_url)
        WebDriverWait(driver, 10).until(lambda d: d.execute_script('return document.readyState') == 'complete')

        if driver.find_elements(By.CSS_SELECTOR, "div.carousel-item"):
            parser = "carousel"
        elif driver.find_elements(By.CSS_SELECTOR, "div.accordion-item"):
            parser = "accordion"
        elif driver.find_elements(By.CSS_SELECTOR, "a[href$='.pdf'], table"):
            parser = "tenders"
        else:
            parser = "students"

        driver.quit()
        print(f"[Parser Type Detected]: {parser}")
        return parser
    except Exception as e:
        print("[Parser Detection Error]:", e)
        return "students"

# === Scraper Core ===
def scrape_and_store(org_name, base_url, sections):
    driver = webdriver.Chrome(service=Service(chrome_driver_path), options=options)
    conn = get_db()
    cur = conn.cursor()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    keywords = get_default_keywords()
    for sec in sections:
        try:
            full_url = base_url.rstrip("/") + sec["section_url"]
            driver.get(full_url)
            WebDriverWait(driver, 10).until(lambda d: d.execute_script('return document.readyState') == 'complete')
            parser = parser_map.get(sec["parser_type"], parse_students)
            try:
                items = parser(driver)
            except Exception as pe:
                print(f"[Parse Error] {sec['section_name']}: {pe}")
                items = []
            
            filtered_items = filter_items(items, keywords)
            for item in filtered_items:
                cur.execute("""
                    INSERT INTO notices (org_name, section_name, title, url, scraped_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE scraped_at = VALUES(scraped_at)
                """, (org_name, sec["section_name"], item["title"], item["url"], now))
        except Exception as e:
            print(f"Error in {org_name} > {sec['section_name']}: {e}")
    conn.commit()
    conn.close()
    driver.quit()

# === API Routes ===

@app.route("/api/<org_name>", methods=["GET"])
def get_cached_notices(org_name):
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, org_name,section_name, title, url FROM notices
        WHERE org_name = %s AND scraped_at >= %s
        ORDER BY scraped_at DESC
    """, (org_name, (datetime.now() - timedelta(minutes=30)).strftime('%Y-%m-%d %H:%M:%S')))
    rows = cur.fetchall()
    conn.close()
    return jsonify(rows)

@app.route("/api/scrape-now/<org_name>", methods=["POST"])
def scrape_now(org_name):
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id, name, base_url FROM organizations WHERE LOWER(name) = %s", (org_name.lower(),))
    org = cur.fetchone()
    cur.execute("SELECT section_name, section_url, parser_type FROM sections WHERE org_id = %s", (org["id"],))
    sections = cur.fetchall()
    conn.close()
    scrape_and_store(org["name"], org["base_url"], sections)
    return jsonify({"status": "refreshed"})

@app.route("/api/organizations")
def list_orgs():
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT name FROM organizations")
    return jsonify(cur.fetchall())

@app.route("/add-section", methods=["POST"])
def add_section():
    data = request.get_json()
    org_name = data.get('org_name')
    base_url = data.get('base_url').rstrip("/")
    section_name = data.get('section_name')
    section_url = data.get('section_url').strip()
    full_url = base_url + section_url

    parser_type = detect_parser_type(full_url)

    conn = get_db()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id FROM organizations WHERE name = %s", (org_name,))
    org = cur.fetchone()

    if org:
        org_id = org["id"]
    else:
        cur.execute("INSERT INTO organizations (name, base_url) VALUES (%s, %s)", (org_name, base_url))
        org_id = cur.lastrowid

    cur.execute("INSERT INTO sections (org_id, section_name, section_url, parser_type) VALUES (%s, %s, %s, %s)",
                (org_id, section_name, section_url, parser_type))
    conn.commit()
    scrape_and_store(org_name, base_url, [{
        "section_name": section_name,
        "section_url": section_url,
        "parser_type": parser_type
    }])
    conn.close()
    return jsonify({"status": "added", "parser_type": parser_type})

@app.route("/api/send-email", methods=["POST", "OPTIONS"])
def handle_email():
    if request.method == "OPTIONS":
        return '', 200
    try:
        content = request.get_json()
        portal = content.get("portal", "No Portal")
        message = content.get("message", "")
        data = content.get("data", [])
        # New recipient from frontend (can be a single email or list)
        recipients = content.get("recipient")

        if not recipients:
            return jsonify({"status": "error", "error": "No recipients provided"}), 400

        # Ensure recipients is a list
        if isinstance(recipients, str):
            recipients = [recipients]

        html = f"<h2>{portal} - Updates</h2>"
        if message:
            html += f"<p>{message}</p>"

        html += "<table border='1'><tr><th>Org</th><th>Section</th><th>Title</th><th>Link</th></tr>"
        for item in data:
            html += f"<tr><td>{item.get('org')}</td><td>{item.get('section')}</td><td>{item.get('title')}</td><td><a href='{item.get('url')}'>View</a></td></tr>"
        html += "</table>"

        # Send email with updated recipients list
        success = send_email(subject=f"{portal} - Notices", html_body=html, recipients=recipients)
        return jsonify({"status": "sent" if success else "error"})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


# Modify send_email function to accept recipients list dynamically
def send_email(subject, html_body, recipients=None):
    if recipients is None:
        print("❌ No recipients provided.")
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = EMAIL_ADDRESS
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html"))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.sendmail(EMAIL_ADDRESS, recipients, msg.as_string())
        print("✅ Email sent successfully.")
        return True
    except Exception as e:
        print("❌ Email error:", repr(e))
        return False

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")
    email = data.get("email", "").strip()

    if not username or not password or not email:
        return jsonify({"error": "Missing required fields"}), 400

    conn = get_db()
    cur = conn.cursor(dictionary=True)

    # Check if user already exists
    cur.execute("SELECT id FROM users WHERE username = %s OR email = %s", (username, email))
    existing_user = cur.fetchone()
    if existing_user:
        conn.close()
        return jsonify({"error": "User already exists"}), 400

    hashed_pw = generate_password_hash(password)
    cur.execute("INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)", (username, email, hashed_pw))
    conn.commit()
    conn.close()

    return jsonify({"message": "Signup successful"}), 200

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Missing username or password"}), 400

    conn = get_db()
    cur = conn.cursor(dictionary=True)

    cur.execute("SELECT id, username, password_hash FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    conn.close()

    if user and check_password_hash(user["password_hash"], password):
        return jsonify({"message": "Login successful!", "username": user["username"]})
    else:
        return jsonify({"error": "Invalid username or password"}), 401

@app.route("/api/search", methods=["GET"])
def search_notices():
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify({"error": "Missing search query"}), 400

    keywords = [k.strip() for k in query.split(',') if k.strip()]
    if not keywords:
        return jsonify({"error": "No valid keywords found"}), 400

    # Build dynamic SQL WHERE clause with OR logic
    conditions = []
    params = []

    for k in keywords:
        like_term = f"%{k}%"
        conditions.append("(LOWER(title) LIKE %s OR LOWER(section_name) LIKE %s)")
        params.extend([like_term, like_term])

    sql = f"""
        SELECT org_name AS org, section_name AS section, title, url, scraped_at
        FROM notices
        WHERE {" OR ".join(conditions)}
        ORDER BY scraped_at DESC
        LIMIT 100
    """

    with get_db() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        results = cur.fetchall()

    return jsonify(results)

def get_default_keywords():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT keyword FROM default_keywords")
    result = [row[0].lower() for row in cur.fetchall()]
    conn.close()
    return result

def is_default_keyword(keyword):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT keyword FROM default_keywords WHERE keyword = %s", (keyword,))
    result = cur.fetchone()
    conn.close()
    return result is not None

@app.route("/api/keyword-search", methods=["POST"])
def keyword_search():
    data = request.get_json()
    keyword = data.get("keyword", "").strip().lower()
    org_name = data.get("org_name", "").strip()
    add_to_defaults = data.get("add_to_defaults", False)

    if not keyword or not org_name:
        return jsonify({"error": "Missing keyword or org name"}), 400

    if is_default_keyword(keyword):
        # Fetch cached notices from DB
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT org_name AS org, section_name AS section, title, url, scraped_at
            FROM notices
            WHERE org_name = %s AND (LOWER(title) LIKE %s OR LOWER(section_name) LIKE %s)
            ORDER BY scraped_at DESC
        """, (org_name, f"%{keyword}%", f"%{keyword}%"))
        results = cur.fetchall()
        conn.close()
        return jsonify({"source": "cached", "results": results})

    else:
        # Dynamic scrape fresh results
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id, name, base_url FROM organizations WHERE LOWER(name) = %s", (org_name.lower(),))
        org = cur.fetchone()
        if not org:
            conn.close()
            return jsonify({"error": "Organization not found"}), 404
        cur.execute("SELECT section_name, section_url, parser_type FROM sections WHERE org_id = %s", (org["id"],))
        sections = cur.fetchall()
        conn.close()

        driver = webdriver.Chrome(service=Service(chrome_driver_path), options=options)
        scraped_items = []
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for sec in sections:
            try:
                full_url = org["base_url"].rstrip("/") + sec["section_url"]
                driver.get(full_url)
                WebDriverWait(driver, 10).until(lambda d: d.execute_script('return document.readyState') == 'complete')
                parser = parser_map.get(sec["parser_type"], parse_students)
                raw_items = parser(driver)
                for item in raw_items:
                    if keyword in item["title"].lower():
                        scraped_items.append({
                            "org": org["name"],
                            "section": sec["section_name"],
                            "title": item["title"],
                            "url": item["url"],
                            "scraped_at": now
                        })
            except Exception as e:
                print(f"[Dynamic Scrape Error]: {e}")

        driver.quit()

        # Save to DB if requested
        if add_to_defaults:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("INSERT IGNORE INTO default_keywords (keyword) VALUES (%s)", (keyword,))
            for item in scraped_items:
                cur.execute("""
                    INSERT INTO notices (org_name, section_name, title, url, scraped_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE scraped_at = VALUES(scraped_at)
                """, (item["org"], item["section"], item["title"], item["url"], item["scraped_at"]))
            conn.commit()
            conn.close()

        return jsonify({"source": "scraped", "results": scraped_items})

def background_scraper():
    while True:
        try:
            conn = get_db()
            cur = conn.cursor(dictionary=True)
            cur.execute("SELECT * FROM organizations")
            orgs = cur.fetchall()
            for org in orgs:
                cur.execute("SELECT section_name, section_url, parser_type FROM sections WHERE org_id = %s", (org["id"],))
                sections = cur.fetchall()
                print(f"[Background] Scraping {org['name']}")
                scrape_and_store(org["name"], org["base_url"], sections)
            conn.close()
        except Exception as e:
            print(f"[Background Scraper Error] {e}")
        time.sleep(1500)

threading.Thread(target=background_scraper, daemon=True).start()

if __name__ == "__main__":
    app.run(debug=True)
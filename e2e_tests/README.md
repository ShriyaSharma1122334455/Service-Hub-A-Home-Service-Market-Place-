# ServiceHub — Selenium E2E Test Suite

End-to-end tests covering the full frontend + backend stack using
**Selenium 4 + pytest**. Tests run against a live instance of both
services (frontend on port 5173, backend on port 3000).

---

## Directory layout

```
e2e_tests/
├── conftest.py              # Shared fixtures: driver, API client, login helpers
├── pytest.ini               # Pytest config, markers, HTML report path
├── requirements.txt         # Python dependencies
├── .env.test.example        # Template — copy to .env.test and fill credentials
├── pages/
│   ├── base_page.py         # BasePage with wait/click/fill helpers
│   ├── login_page.py        # LoginPage POM
│   ├── register_page.py     # RegisterPage POM
│   └── navbar.py            # NavBar helper
├── tests/
│   ├── test_01_auth.py      # Login, logout, register, protected route redirects
│   ├── test_02_customer_flow.py  # Dashboard, browse services, booking flow
│   ├── test_03_provider_flow.py  # Provider dashboard, my-bookings, accept/reject/complete
│   ├── test_04_profile.py   # Profile view, edit profile, validation
│   ├── test_05_api_backend.py    # Direct REST API tests (no browser)
│   └── test_06_navigation.py     # Hash routing, NavBar, LOW-01/02 verifications
└── reports/                 # HTML report output (auto-created by pytest)
```

---

## Prerequisites

| Requirement | Minimum version |
|-------------|----------------|
| Python      | 3.11            |
| Google Chrome | 114+          |
| Node.js     | 18+             |

Selenium 4 uses **Selenium Manager** to automatically download the
correct ChromeDriver — no manual driver installation needed.

---

## First-time setup

### 1. Install Python dependencies

```bash
cd e2e_tests
pip install -r requirements.txt
```

### 2. Create test credentials

```bash
cp .env.test.example .env.test
```

Edit `.env.test` and fill in:

```env
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000

TEST_CUSTOMER_EMAIL=test_customer@yourproject.com
TEST_CUSTOMER_PASSWORD=Test@1234!

TEST_PROVIDER_EMAIL=test_provider@yourproject.com
TEST_PROVIDER_PASSWORD=Test@1234!
```

The two test accounts **must already exist** in Supabase.
Create them once via the Register page or the Supabase dashboard,
then set their roles to `customer` and `provider` respectively.

### 3. Start the application

In separate terminals:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Wait until both are ready before running tests.

---

## Running the tests

### Run the full suite

```bash
cd e2e_tests
pytest
```

### Run only smoke tests (quick sanity check)

```bash
pytest -m smoke
```

### Run only API tests (no browser required)

```bash
pytest -m api
```

### Run a specific test file

```bash
pytest tests/test_01_auth.py
pytest tests/test_05_api_backend.py
```

### Run with a visible Chrome window (disable headless)

```bash
SELENIUM_HEADLESS=false pytest
```

### Run with verbose output and stop on first failure

```bash
pytest -v -x
```

### View the HTML report

After any run, open:

```
e2e_tests/reports/report.html
```

---

## Test markers

| Marker       | What it covers |
|--------------|----------------|
| `smoke`      | Critical path — login, health, home |
| `auth`       | Authentication, session, registration |
| `customer`   | Customer dashboard, browse, booking |
| `provider`   | Provider dashboard, my-bookings, accept/reject |
| `profile`    | Profile view and edit |
| `api`        | Direct REST API calls (no browser) |
| `navigation` | Routing, NavBar, redirects |

Run by marker:
```bash
pytest -m "auth or api"
pytest -m "not api"   # only browser tests
```

---

## QA fixes verified by these tests

| Fix ID | Test file | Test class / function |
|--------|-----------|-----------------------|
| MED-03 | `test_05_api_backend.py` | `TestUsersApi.test_list_users_pagination_params_accepted` |
| MED-04 | — | Startup-time validation (tested by running the server) |
| MED-06 | `test_05_api_backend.py` | `TestBookingsApi.test_create_booking_service_belongs_to_provider_validation` |
| MED-07 | — | Structural change; visible in server logs |
| LOW-01 | `test_06_navigation.py` | `TestNoWindowAlert.test_profile_page_uses_no_window_alert` |
| LOW-02 | `test_06_navigation.py` | `TestBookingConfirmationAuthGuard.test_no_token_redirects_to_login` |
| LOW-03 | `test_05_api_backend.py` | `TestAuthApi.test_register_fullname_title_case_normalization` |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `SessionNotCreatedException` | Chrome not installed or wrong version. Install/update Chrome. |
| `WebDriverException: DevToolsActivePort` | Run with `--no-sandbox --disable-dev-shm-usage` (already set). |
| Tests fail with "Login failed" | Verify `TEST_CUSTOMER_EMAIL` / `TEST_PROVIDER_EMAIL` exist and passwords are correct. |
| `assert result.get("success")` fixture error | The test accounts don't exist — create them in Supabase first. |
| `ElementClickInterceptedException` | Page animation still playing. Increase `DEFAULT_WAIT` in `conftest.py`. |
| Rate limit errors on auth tests | Auth tests hit the login endpoint multiple times. Run with `pytest -x` and re-run after 15 min. |
| `SELENIUM_HEADLESS=false` still opens headless | Environment var not exported. Use `SELENIUM_HEADLESS=false pytest` in the same shell, or set it in `.env.test`. |

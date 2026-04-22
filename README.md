# Insurance Claims Triage AI

A full-stack AI-powered insurance claims triage application. The backend uses **FastAPI + LangChain + Claude claude-opus-4-5** to run a 4-tool agent that analyzes claim text and returns a structured JSON assessment. The frontend is a **React + Vite** single-page app.

---

## Project Structure

```
Triage agent/
├── backend/
│   ├── main.py          # FastAPI app + LangChain agent + 4 tools
│   ├── requirements.txt
│   └── .env             # Put your ANTHROPIC_API_KEY here
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main React component
│   │   ├── App.css      # Styles
│   │   └── main.jsx     # React entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Setup & Running

### 1. Backend

```bash
cd backend
```

Create and activate a virtual environment:

```bash
# macOS / Linux
python -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Add your Anthropic API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Start the server:

```bash
python main.py
```

The API will be available at **http://localhost:8000**. Interactive docs at **http://localhost:8000/docs**.

---

### 2. Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at **http://localhost:3000**.

---

## How It Works

### Agent flow

When a claim is submitted the LangChain agent calls **four tools** in sequence:

| # | Tool | Purpose |
|---|------|---------|
| 1 | `extract_claim_fields` | Parse claim type, claimant name, incident date, and estimated value |
| 2 | `score_severity` | Score severity (low / medium / high / critical) and detect liability |
| 3 | `check_fraud_indicators` | Identify red flags such as late reporting, vague details, or suspicious timing |
| 4 | `recommend_actions` | Generate a prioritised action list for the claims handler |

Claude then synthesises all tool outputs into the final structured JSON response.

### API

**`POST /api/triage`**

Request:
```json
{ "claim_text": "My name is Jane Doe. On January 5, 2024..." }
```

Response:
```json
{
  "claim_type": "auto",
  "claimant_name": "Jane Doe",
  "incident_date": "January 5, 2024",
  "estimated_value": 14500,
  "severity": "high",
  "liability_indicator": "yes",
  "red_flags": [],
  "recommended_actions": [
    "Acknowledge receipt and assign a unique claim number",
    "Contact claimant within 24 hours to confirm all details",
    "..."
  ],
  "reasoning": "This is an auto claim involving a third-party collision..."
}
```

---

## Severity Levels

| Level | Typical Threshold |
|-------|-------------------|
| Low | < $5,000 |
| Medium | $5,000 – $24,999 |
| High | $25,000 – $99,999 |
| Critical | ≥ $100,000 or involves fatality / permanent disability |

---

## Notes

- The frontend calls `http://localhost:8000` directly — CORS is pre-configured for `localhost:3000`.
- AI assessments are generated automatically and **must be reviewed by a human adjuster** before any action is taken.
- To use a different Claude model, change the `model` parameter in `build_agent()` inside `backend/main.py`.

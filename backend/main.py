import os
import json
import re
from pathlib import Path
import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

load_dotenv()

app = FastAPI(title="Insurance Claims Triage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DIST = Path(__file__).parent.parent / "frontend" / "dist"


class ClaimRequest(BaseModel):
    claim_text: str


# ─── Shared LLM helper ────────────────────────────────────────────────────────

def _llm_json(system: str, user: str) -> dict:
    """Call Claude and return the response parsed as JSON."""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    raw = msg.content[0].text.strip()
    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


# ─── Tool 1: Extract structured fields ────────────────────────────────────────

@tool
def extract_claim_fields(claim_text: str) -> str:
    """Extract key structured fields from an insurance claim description.
    Returns JSON with: claim_type (auto/property/medical/theft/liability/general),
    claimant_name, incident_date, and estimated_value (total USD amount mentioned)."""

    result = _llm_json(
        system=(
            "You are an insurance data-extraction specialist. "
            "Read the claim text and return ONLY a JSON object with exactly these keys:\n"
            '  "claim_type": one of auto | property | medical | theft | liability | general\n'
            '  "claimant_name": full name of the claimant, or "Unknown" if not stated\n'
            '  "incident_date": the date of the incident as written, or "Not specified"\n'
            '  "estimated_value": a single number (float) representing the total USD value of '
            "all damages/losses mentioned (sum every dollar figure in the text). 0.0 if none.\n"
            "Return ONLY the JSON — no markdown, no explanation."
        ),
        user=claim_text,
    )
    return json.dumps(result)


# ─── Tool 2: Score severity ────────────────────────────────────────────────────

@tool
def score_severity(claim_type: str, estimated_value: float, claim_text: str) -> str:
    """Score the severity of an insurance claim as low / medium / high / critical.
    Also returns liability_indicator (yes / no / unclear).
    Inputs: claim_type, estimated_value (USD), claim_text (full raw text)."""

    result = _llm_json(
        system=(
            "You are an insurance severity-assessment specialist. "
            "Given a claim type, estimated dollar value, and the full claim text, "
            "return ONLY a JSON object with exactly these keys:\n"
            '  "severity": one of low | medium | high | critical\n'
            "    Guidelines: low < $5 000, medium $5 000–$24 999, high $25 000–$99 999, "
            "critical ≥ $100 000 OR involves fatality / permanent disability / catastrophic loss. "
            "Use the full claim context — override the dollar threshold upward for serious injuries.\n"
            '  "liability_indicator": one of yes | no | unclear\n'
            '    "yes" = a third party is clearly at fault; "no" = claimant is at fault; '
            '"unclear" = fault cannot be determined from the text.\n'
            "Return ONLY the JSON — no markdown, no explanation."
        ),
        user=(
            f"Claim type: {claim_type}\n"
            f"Estimated value: ${estimated_value:,.2f}\n\n"
            f"Claim text:\n{claim_text}"
        ),
    )
    return json.dumps(result)


# ─── Tool 3: Check fraud indicators ──────────────────────────────────────────

@tool
def check_fraud_indicators(claim_text: str) -> str:
    """Analyze an insurance claim for potential fraud indicators.
    Returns a JSON object with a list of red_flags detected."""

    result = _llm_json(
        system=(
            "You are an insurance fraud-detection specialist. "
            "Carefully read the claim text and identify any fraud indicators or red flags. "
            "Consider patterns such as: late or delayed reporting, vague or inconsistent details, "
            "suspicious policy timing (claim filed shortly after policy inception or renewal), "
            "no witnesses or corroborating evidence, prior similar claims, pre-existing damage, "
            "pressure for quick settlement, exaggerated or unverifiable values, "
            "high-value claim with unusually sparse description, cash-only or undocumented repairs, "
            "and any other anomalies that suggest the claim may not be genuine.\n\n"
            'Return ONLY a JSON object with a single key "red_flags" whose value is an array of '
            "short, specific strings describing each flag found. "
            "Return an empty array if no indicators are present. "
            "No markdown, no explanation — just the JSON."
        ),
        user=claim_text,
    )
    return json.dumps(result)


# ─── Tool 4: Recommend actions ────────────────────────────────────────────────

@tool
def recommend_actions(severity: str, liability_indicator: str, claim_type: str, red_flags_json: str) -> str:
    """Generate a prioritized list of recommended actions for the claims handler.
    Inputs: severity (low/medium/high/critical), liability_indicator (yes/no/unclear),
    claim_type (auto/property/medical/theft/liability/general),
    red_flags_json (JSON array of red flag strings from check_fraud_indicators)."""

    try:
        red_flags: list[str] = json.loads(red_flags_json) if red_flags_json else []
    except json.JSONDecodeError:
        red_flags = []

    result = _llm_json(
        system=(
            "You are a senior insurance claims handler. "
            "Given the triage assessment for a claim, generate a prioritized, actionable list of steps "
            "for the claims team to follow. Be specific and practical. "
            "Always include universal steps (acknowledge receipt, contact claimant). "
            "Escalate appropriately based on severity. "
            "Include subrogation steps if a third party is liable. "
            "Include claim-type-specific investigation steps. "
            "If fraud indicators are present, include SIU referral and hold recommendations.\n\n"
            'Return ONLY a JSON object with a single key "recommended_actions" whose value is an '
            "ordered array of action strings. No markdown, no explanation — just the JSON."
        ),
        user=(
            f"Claim type: {claim_type}\n"
            f"Severity: {severity}\n"
            f"Liability indicator: {liability_indicator}\n"
            f"Fraud red flags ({len(red_flags)} detected): {red_flags}"
        ),
    )
    return json.dumps(result)


# ─── Agent factory ─────────────────────────────────────────────────────────────

def build_agent() -> AgentExecutor:
    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        temperature=0,
    )

    tools = [extract_claim_fields, score_severity, check_fraud_indicators, recommend_actions]

    system_prompt = (
        "You are an expert insurance claims triage agent. "
        "Analyze the provided claim by calling ALL four tools in this exact order:\n\n"
        "1. extract_claim_fields — pass the full raw claim text\n"
        "2. score_severity — pass the claim_type and estimated_value from step 1, plus the full claim text\n"
        "3. check_fraud_indicators — pass the full raw claim text\n"
        "4. recommend_actions — pass severity and liability_indicator from step 2, "
        "claim_type from step 1, and the red_flags list (as a JSON string) from step 3\n\n"
        "After all four tools have returned results, output ONLY a single valid JSON object "
        "with exactly these keys: claim_type (string), claimant_name (string), "
        "incident_date (string), estimated_value (number), "
        "severity (one of: low, medium, high, critical), "
        "liability_indicator (one of: yes, no, unclear), "
        "red_flags (array of strings), recommended_actions (array of strings), "
        "and reasoning (one-paragraph plain-English explanation of the overall assessment). "
        "Return ONLY the JSON — no markdown fences, no preamble, no trailing text."
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=10)


# ─── API endpoint ─────────────────────────────────────────────────────────────

@app.post("/api/triage")
async def triage_claim(request: ClaimRequest):
    if not request.claim_text.strip():
        raise HTTPException(status_code=400, detail="claim_text must not be empty")

    try:
        executor = build_agent()
        result = await executor.ainvoke({
            "input": f"Analyze this insurance claim and triage it:\n\n{request.claim_text}"
        })

        raw_output = result.get("output", "")
        if isinstance(raw_output, list):
            raw_output = " ".join(
                item.get("text", "") if isinstance(item, dict) else str(item)
                for item in raw_output
            )
        raw_output = str(raw_output)

        # Strip any accidental markdown fences
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw_output.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned.strip())

        # Extract outermost JSON object
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise HTTPException(status_code=500, detail=f"Agent did not return valid JSON. Raw output: {raw_output[:500]}")

        return json.loads(match.group(0))

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ─── Static frontend ──────────────────────────────────────────────────────────

app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse(DIST / "index.html")


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

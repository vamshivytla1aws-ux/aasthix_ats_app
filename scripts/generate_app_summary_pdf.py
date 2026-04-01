from pathlib import Path
from textwrap import wrap

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs"
OUTPUT_PATH = OUTPUT_DIR / "ats-app-summary.pdf"

PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 40
GUTTER = 20
COLUMN_WIDTH = (PAGE_WIDTH - (MARGIN * 2) - GUTTER) / 2

COLORS = {
    "navy": HexColor("#0F172A"),
    "slate": HexColor("#475569"),
    "muted": HexColor("#64748B"),
    "line": HexColor("#CBD5E1"),
    "panel": HexColor("#F8FAFC"),
}


LEFT_CONTENT = [
    (
        "What It Is",
        [
            "AASTHIX TALENT is a Next.js-based applicant tracking workspace for managing jobs, candidates, applications, interviews, and recruiting operations.",
            "The repo also includes optional AI-assisted matching and screening flows plus a separate Python matcher service for deterministic JD-resume scoring.",
        ],
    ),
    (
        "Who It's For",
        [
            "Primary persona: internal recruiting teams - especially recruiters and admins managing requisitions, candidate flow, interviews, and team coordination.",
        ],
    ),
    (
        "What It Does",
        [
            "Manage jobs, requisitions, candidates, vendors, and applications.",
            "Track pipeline stages, interview schedules, and interview alerts.",
            "Show dashboard, funnel, recruiter, and screening analytics.",
            "Support role-based access, admin permissions, invites, and audit views.",
            "Provide team chat, activity center, and recruiter copilot/workload screens.",
            "Publish a careers portal and accept job applications and resume parsing imports.",
            "Run candidate-job matching through rule-based, queued, and optional OpenAI/vector flows.",
        ],
    ),
    (
        "How To Run",
        [
            "1. Run `npm install`.",
            "2. Create `.env.local` from `.env.example`; set `DATABASE_URL`, `JWT_SECRET`, and other needed values.",
            "3. Provision PostgreSQL and apply SQL files in `migrations/` manually. Migration runner command: Not found in repo.",
            "4. Run `npm run dev`, then open `http://localhost:3000`.",
            "5. Optional: start `matcher-service` for `/api/match/no-ai`; start Redis plus `npm run worker:ai-match` for async AI matching.",
        ],
    ),
]


RIGHT_CONTENT = [
    (
        "How It Works",
        [
            "UI: Next.js App Router pages under `app/(dashboard)`, `app/(auth)`, and `app/careers`; shared React components under `components/` call JSON APIs with `apiFetchJson` and SWR providers.",
            "Auth + access: middleware checks for the auth cookie on protected pages; API routes validate JWT-backed users and enforce role/permission gates through `lib/auth*` and `lib/rbac.ts`.",
            "Core backend: route handlers in `app/api/**` read and write ATS data with `node-postgres` via `lib/db.js`, backed by PostgreSQL schema files in `migrations/`.",
            "Async matching: BullMQ queues on Redis enqueue job-level matching runs; `lib/queue/worker.ts` executes `runSkillProfileExtractCore` and persists run status.",
            "External/optional services: `matcher-service/` exposes a Python `/match` endpoint for deterministic JD-resume scoring; OpenAI/vector features are controlled by env flags in `.env.example` and matching libs under `lib/`.",
            "Infra/deployment docs: Not found in repo.",
        ],
    ),
]


def draw_wrapped_text(pdf, text, x, y, width, font_name="Helvetica", font_size=9.1, leading=11, bullet=None):
    pdf.setFont(font_name, font_size)
    char_width = max(28, int(width / (font_size * 0.5)))
    raw_lines = []
    for paragraph in text.split("\n"):
        wrapped = wrap(paragraph, width=char_width, break_long_words=False, break_on_hyphens=False) or [""]
        raw_lines.extend(wrapped)

    first_prefix = f"{bullet} " if bullet else ""
    rest_prefix = "  " if bullet else ""
    for idx, line in enumerate(raw_lines):
        prefix = first_prefix if idx == 0 else rest_prefix
        pdf.drawString(x, y, prefix + line)
        y -= leading
    return y


def draw_section(pdf, title, items, x, y):
    pdf.setFillColor(COLORS["panel"])
    pdf.roundRect(x, y - 18, COLUMN_WIDTH, 18, 6, fill=1, stroke=0)
    pdf.setFillColor(COLORS["navy"])
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(x + 8, y - 6, title)
    y -= 30
    pdf.setFillColor(COLORS["slate"])
    for item in items:
        if title in {"What It Does", "How To Run", "How It Works"}:
            y = draw_wrapped_text(pdf, item, x + 2, y, COLUMN_WIDTH - 4, bullet="-")
        else:
            y = draw_wrapped_text(pdf, item, x, y, COLUMN_WIDTH)
        y -= 4
    return y - 8


def build_pdf(path: Path):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(path), pagesize=letter)
    pdf.setTitle("ATS App Summary")

    pdf.setFillColor(COLORS["navy"])
    pdf.rect(0, PAGE_HEIGHT - 78, PAGE_WIDTH, 78, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(MARGIN, PAGE_HEIGHT - 40, "ATS App Summary")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(
        MARGIN,
        PAGE_HEIGHT - 58,
        "One-page repo-backed overview generated from the codebase on 2026-03-26",
    )

    top_y = PAGE_HEIGHT - 98
    left_x = MARGIN
    right_x = MARGIN + COLUMN_WIDTH + GUTTER

    y_left = top_y
    for title, items in LEFT_CONTENT:
        y_left = draw_section(pdf, title, items, left_x, y_left)

    y_right = top_y
    for title, items in RIGHT_CONTENT:
        y_right = draw_section(pdf, title, items, right_x, y_right)

    pdf.setStrokeColor(COLORS["line"])
    pdf.line(MARGIN, 34, PAGE_WIDTH - MARGIN, 34)
    pdf.setFillColor(COLORS["muted"])
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(MARGIN, 21, "Sources used: package.json, README.md, .env.example, app/, lib/, matcher-service/, migrations/")
    pdf.save()



def verify_single_page(path: Path):
    reader = PdfReader(str(path))
    if len(reader.pages) != 1:
        raise RuntimeError(f"Expected 1 page, found {len(reader.pages)} pages")


if __name__ == "__main__":
    build_pdf(OUTPUT_PATH)
    verify_single_page(OUTPUT_PATH)
    print(OUTPUT_PATH)

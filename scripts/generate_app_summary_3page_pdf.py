from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs"
OUTPUT_PATH = OUTPUT_DIR / "ats-app-summary-3page.pdf"
LOGO_PATH = ROOT / "public" / "brand-logo.png"


def count_files(path: Path, name: str) -> int:
    return sum(1 for p in path.rglob(name) if p.is_file())


def count_pages() -> int:
    return sum(1 for p in (ROOT / "app").rglob("page.tsx") if p.is_file())


stats = {
    "dashboard_pages": count_pages(),
    "api_routes": count_files(ROOT / "app" / "api", "route.ts"),
    "lib_modules": sum(1 for p in (ROOT / "lib").rglob("*.ts") if p.is_file()) + sum(1 for p in (ROOT / "lib").rglob("*.js") if p.is_file()),
    "migrations": sum(1 for p in (ROOT / "migrations").glob("*.sql") if p.is_file()),
}

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleLarge", fontName="Helvetica-Bold", fontSize=24, leading=28, textColor=colors.HexColor("#0F172A"), spaceAfter=10))
styles.add(ParagraphStyle(name="Subtle", fontName="Helvetica", fontSize=10, leading=14, textColor=colors.HexColor("#475569")))
styles.add(ParagraphStyle(name="Section", fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=colors.HexColor("#1D4ED8"), spaceBefore=8, spaceAfter=8))
styles.add(ParagraphStyle(name="Body", fontName="Helvetica", fontSize=10.2, leading=14, textColor=colors.HexColor("#111827")))
styles.add(ParagraphStyle(name="Small", fontName="Helvetica", fontSize=8.8, leading=12, textColor=colors.HexColor("#475569")))
styles.add(ParagraphStyle(name="CalloutTitle", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.white))
styles.add(ParagraphStyle(name="CalloutBody", fontName="Helvetica", fontSize=9.4, leading=13, textColor=colors.white))
styles.add(ParagraphStyle(name="CenterSmall", parent=styles["Small"], alignment=TA_CENTER))


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#0F172A"))
    canvas.rect(0, doc.height + doc.topMargin + 10, letter[0], 22, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(doc.leftMargin, letter[1] - 24, "AASTHIX Talent ATS - Repo Summary")
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(letter[0] - doc.rightMargin, 18, f"Page {doc.page}")
    canvas.restoreState()


def metric_table():
    data = [
        ["Dashboard pages", str(stats["dashboard_pages"]), "API routes", str(stats["api_routes"])],
        ["Lib modules", str(stats["lib_modules"]), "SQL migrations", str(stats["migrations"])],
    ]
    t = Table(data, colWidths=[1.5*inch, 0.8*inch, 1.5*inch, 0.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ("TEXTCOLOR", (0,0), (-1,-1), colors.HexColor("#0F172A")),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("GRID", (0,0), (-1,-1), 0.6, colors.HexColor("#BFDBFE")),
        ("PADDING", (0,0), (-1,-1), 8),
        ("ALIGN", (1,0), (1,-1), "CENTER"),
        ("ALIGN", (3,0), (3,-1), "CENTER"),
    ]))
    return t


def bullet_list(items):
    return ListFlowable(
        [ListItem(Paragraph(item, styles["Body"])) for item in items],
        bulletType="bullet",
        start="circle",
        leftPadding=18,
        bulletFontName="Helvetica",
        bulletFontSize=9,
    )


def architecture_drawing():
    d = Drawing(500, 170)
    boxes = [
        (10, 95, 115, 45, "React UI\napp/(dashboard), auth, careers", "#DBEAFE"),
        (145, 95, 115, 45, "Next.js API\napp/api/**", "#E0E7FF"),
        (280, 95, 115, 45, "PostgreSQL\nlib/db.js + migrations", "#DCFCE7"),
        (145, 25, 115, 45, "BullMQ + Redis\nasync AI match jobs", "#FEF3C7"),
        (280, 25, 115, 45, "Python matcher\nmatcher-service /match", "#FCE7F3"),
    ]
    for x, y, w, h, label, fill in boxes:
        d.add(Rect(x, y, w, h, rx=8, ry=8, fillColor=colors.HexColor(fill), strokeColor=colors.HexColor("#94A3B8")))
        for idx, line in enumerate(label.split("\n")):
            d.add(String(x + 10, y + h - 16 - (idx * 13), line, fontName="Helvetica-Bold" if idx == 0 else "Helvetica", fontSize=9, fillColor=colors.HexColor("#0F172A")))
    lines = [
        (125, 117, 145, 117),
        (260, 117, 280, 117),
        (202, 95, 202, 70),
        (337, 95, 337, 70),
        (260, 47, 280, 47),
    ]
    for x1, y1, x2, y2 in lines:
        d.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor("#64748B"), strokeWidth=1.2))
    return d


story = []

# Page 1
if LOGO_PATH.exists():
    story.append(Image(str(LOGO_PATH), width=1.5*inch, height=1.5*inch))
story.append(Paragraph("ATS App Summary", styles["TitleLarge"]))
story.append(Paragraph("A 3-page repo-backed overview of the AASTHIX Talent application, its user surface, core workflows, and supporting services.", styles["Subtle"]))
story.append(Spacer(1, 0.18*inch))
story.append(metric_table())
story.append(Spacer(1, 0.18*inch))
story.append(Paragraph("What It Is", styles["Section"]))
story.append(Paragraph("AASTHIX Talent is a full-stack applicant tracking system built on Next.js, React, Tailwind, and PostgreSQL. The repo combines recruiting operations, careers intake, chat, analytics, screening, and multiple matching pipelines inside one workspace.", styles["Body"]))
story.append(Spacer(1, 0.08*inch))
story.append(Paragraph("Who It's For", styles["Section"]))
story.append(Paragraph("Primary users are internal recruiting teams: recruiters, admins, hiring managers, and coordinators who manage jobs, candidates, applications, interviews, approvals, and team collaboration.", styles["Body"]))
story.append(Spacer(1, 0.08*inch))
story.append(Paragraph("At A Glance", styles["Section"]))
story.append(bullet_list([
    "Dashboard navigation covers candidates, jobs, requisitions, pipeline, clients, interviews, chat, analytics, alerts, screening, audit, roadmap, recruiter copilot, and recruiter workload.",
    "Public careers routes let external candidates browse open roles and submit applications with resumes.",
    "RBAC and team-based visibility are implemented through permission keys plus job-team membership.",
    "The repo includes both deterministic and AI-assisted candidate-job matching paths.",
]))
callout = Table([[Paragraph("Screenshot status", styles["CalloutTitle"])], [Paragraph("Live screenshots were attempted on March 28, 2026, but the local headless render only returned a Next.js error shell ('missing required error components'). This PDF therefore uses repo evidence, the product logo, and generated diagrams instead of unusable screenshots.", styles["CalloutBody"]) ]], colWidths=[6.7*inch])
callout.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#1E3A8A")),
    ("BOX", (0,0), (-1,-1), 0, colors.white),
    ("LEFTPADDING", (0,0), (-1,-1), 10),
    ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ("TOPPADDING", (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
story.append(Spacer(1, 0.12*inch))
story.append(callout)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Key Capabilities", styles["TitleLarge"]))
story.append(Paragraph("Representative features visible in routes, components, APIs, and docs.", styles["Subtle"]))
story.append(Spacer(1, 0.15*inch))
feature_table = Table([
    [Paragraph("Hiring operations", styles["Body"]), Paragraph("Jobs, requisitions, candidate records, applications, pipeline board, shortlist and status flows.", styles["Body"])],
    [Paragraph("Interviews and screening", styles["Body"]), Paragraph("Interview scheduling/alerts plus screening tests, analytics, resends, and time-to-submit tracking.", styles["Body"])],
    [Paragraph("Recruiter productivity", styles["Body"]), Paragraph("Recruiter copilot, workload views, activity center, alerts, dashboard metrics, and audit surfaces.", styles["Body"])],
    [Paragraph("Team collaboration", styles["Body"]), Paragraph("Built-in chat conversations/messages, admin invites, permissions, and job-team visibility rules.", styles["Body"])],
    [Paragraph("Careers portal", styles["Body"]), Paragraph("Public jobs listing, JD modal, application form, resume upload, confirmation email, and funnel tracking events.", styles["Body"])],
    [Paragraph("Matching stack", styles["Body"]), Paragraph("Rule-based Python matcher, optional OpenAI/vector matching, async queue processing, and run-status polling.", styles["Body"])],
], colWidths=[1.75*inch, 4.95*inch])
feature_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.white),
    ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.HexColor("#F8FAFC"), colors.HexColor("#FFFFFF")]),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
]))
story.append(feature_table)
story.append(Spacer(1, 0.16*inch))
story.append(Paragraph("Notable Repo-Backed Workflows", styles["Section"]))
story.append(bullet_list([
    "Candidate intake: bulk import, resume parsing, public careers apply flow, and candidate CRUD APIs.",
    "Hiring execution: jobs and applications feed dashboard cards, pipeline stages, interview alerts, and analytics endpoints.",
    "Governance: permission keys, admin pages, audit feeds, and owner-or-team visibility filters shape access.",
    "Matching: no-AI matching can prefilter in Postgres and then call the Python /match service; async AI matching can enqueue BullMQ jobs and process them in a worker.",
]))
story.append(Spacer(1, 0.14*inch))
story.append(Paragraph("Evidence Sources Used", styles["Section"]))
story.append(bullet_list([
    "`package.json` for runtime stack and scripts.",
    "`README.md` and `.env.example` for baseline setup and env requirements.",
    "`app/(dashboard)`, `app/(auth)`, `app/careers`, and `app/api/**` for pages and APIs.",
    "`lib/` modules for auth, RBAC, queueing, matching, and careers workflows.",
    "`docs/no-ai-matching.md`, `docs/PERMISSION_MATRIX.md`, and `matcher-service/README.md` for supporting implementation detail.",
]))
story.append(PageBreak())

# Page 3
story.append(Paragraph("Architecture And Runbook", styles["TitleLarge"]))
story.append(Paragraph("Compact view of components, services, and minimal startup steps.", styles["Subtle"]))
story.append(Spacer(1, 0.15*inch))
story.append(architecture_drawing())
story.append(Spacer(1, 0.12*inch))
story.append(Paragraph("How It Works", styles["Section"]))
story.append(bullet_list([
    "React pages render the dashboard, auth screens, and careers portal; client code fetches JSON from route handlers under `app/api/**`.",
    "Middleware protects non-public pages by checking for the auth cookie, while APIs enforce JWT-backed identity and permission checks through `lib/auth.ts`, `lib/authServer.ts`, and `lib/rbac.ts`.",
    "PostgreSQL is the system of record. `lib/db.js` creates the pool, and `migrations/*.sql` define the evolving schema for ATS entities and match runs.",
    "Optional async AI matching uses BullMQ with Redis plus a dedicated worker process (`npm run worker:ai-match`).",
    "Optional deterministic matching uses the separate `matcher-service` Python server at `/match`.",
]))
story.append(Spacer(1, 0.14*inch))
story.append(Paragraph("Minimal Getting Started", styles["Section"]))
story.append(bullet_list([
    "Run `npm install`.",
    "Create `.env.local` from `.env.example` and set at least `DATABASE_URL` and `JWT_SECRET`; add SMTP, OpenAI, and other values only for the features you plan to use.",
    "Provision PostgreSQL and apply the SQL files in `migrations/`. A migration runner command was not found in the repo, so this appears to be a manual step.",
    "Start the app with `npm run dev` and open `http://localhost:3000`.",
    "Optional: run `python -m matcher_service.simple_server` inside `matcher-service/` for no-AI matching.",
    "Optional: start Redis and run `npm run worker:ai-match` for queued AI match extraction jobs.",
]))
story.append(Spacer(1, 0.12*inch))
closing = Table([[Paragraph("Bottom line", styles["CalloutTitle"])], [Paragraph("This repo is not just a basic ATS scaffold anymore. The evidence shows a broader recruiting operations platform with public career intake, internal collaboration, admin governance, analytics, screening, and multiple matching paths layered on top of a PostgreSQL-backed Next.js application.", styles["CalloutBody"]) ]], colWidths=[6.7*inch])
closing.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#0F766E")),
    ("LEFTPADDING", (0,0), (-1,-1), 10),
    ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ("TOPPADDING", (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
story.append(closing)
story.append(Spacer(1, 0.1*inch))
story.append(Paragraph("Generated from local repo evidence on 2026-03-28.", styles["CenterSmall"]))

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TMP_DIR.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(OUTPUT_PATH), pagesize=letter, leftMargin=42, rightMargin=42, topMargin=42, bottomMargin=28)
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)

reader = PdfReader(str(OUTPUT_PATH))
if len(reader.pages) not in {2, 3}:
    raise RuntimeError(f"Expected 2 or 3 pages, found {len(reader.pages)}")
print(OUTPUT_PATH)
print(len(reader.pages))

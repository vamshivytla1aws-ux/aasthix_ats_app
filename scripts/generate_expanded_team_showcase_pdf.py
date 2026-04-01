from pathlib import Path
from textwrap import wrap

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'pdf' / 'ats-app-team-showcase-expanded.pdf'
LOGO = ROOT / 'public' / 'brand-logo.png'
IMG1 = ROOT / 'tmp' / 'pdfs' / 'ui-captures'
IMG2 = ROOT / 'tmp' / 'pdfs' / 'ui-captures-detail'
PAGE_W, PAGE_H = landscape(letter)
MARGIN = 26

NAVY = HexColor('#0F172A')
BLUE = HexColor('#1D4ED8')
INDIGO = HexColor('#4F46E5')
SLATE = HexColor('#475569')
MUTED = HexColor('#64748B')
LINE = HexColor('#CBD5E1')
PANEL = HexColor('#F8FAFC')
GREEN = HexColor('#065F46')


def fit_rect(img_w, img_h, box_w, box_h):
    scale = min(box_w / img_w, box_h / img_h)
    return img_w * scale, img_h * scale


def text_lines(text, width):
    lines = []
    for para in text.split('\n'):
        lines.extend(wrap(para, width=width) or [''])
    return lines


def draw_header(pdf, title, subtitle, page_no):
    pdf.setFillColor(NAVY)
    pdf.rect(0, PAGE_H - 54, PAGE_W, 54, fill=1, stroke=0)
    if LOGO.exists():
        pdf.drawImage(str(LOGO), MARGIN, PAGE_H - 42, width=22, height=22, mask='auto')
    pdf.setFillColor(white)
    pdf.setFont('Helvetica-Bold', 20)
    pdf.drawString(MARGIN + 30, PAGE_H - 22, title)
    pdf.setFont('Helvetica', 9.5)
    pdf.drawString(MARGIN, PAGE_H - 68, subtitle)
    pdf.setFillColor(MUTED)
    pdf.setFont('Helvetica', 8.5)
    pdf.drawRightString(PAGE_W - MARGIN, 16, f'Page {page_no}')


def draw_wrapped(pdf, text, x, y, width_chars=84, leading=12, font='Helvetica', size=10, color=SLATE):
    pdf.setFillColor(color)
    pdf.setFont(font, size)
    for line in text_lines(text, width_chars):
        pdf.drawString(x, y, line)
        y -= leading
    return y


def draw_bullets(pdf, items, x, y, width_chars=80, leading=13):
    pdf.setFont('Helvetica', 10)
    pdf.setFillColor(SLATE)
    for item in items:
        lines = text_lines(item, width_chars)
        for idx, line in enumerate(lines):
            prefix = '- ' if idx == 0 else '  '
            pdf.drawString(x, y, prefix + line)
            y -= leading
        y -= 2
    return y


def draw_stat_box(pdf, x, y, w, h, label, value, tone='#DBEAFE'):
    pdf.setFillColor(HexColor(tone))
    pdf.setStrokeColor(LINE)
    pdf.roundRect(x, y, w, h, 10, fill=1, stroke=1)
    pdf.setFillColor(NAVY)
    pdf.setFont('Helvetica-Bold', 18)
    pdf.drawCentredString(x + w/2, y + h/2 + 2, str(value))
    pdf.setFont('Helvetica', 9)
    pdf.drawCentredString(x + w/2, y + 12, label)


def draw_card(pdf, x, y, w, h, title=None, body=None):
    pdf.setFillColor(white)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(x, y, w, h, 12, fill=1, stroke=1)
    if title:
        pdf.setFillColor(BLUE)
        pdf.setFont('Helvetica-Bold', 12)
        pdf.drawString(x + 12, y + h - 20, title)
    if body:
        draw_wrapped(pdf, body, x + 12, y + h - 38, width_chars=max(35, int(w/6.8)), leading=11, size=9)


def draw_image_card(pdf, x, y, w, h, image_path, label, caption):
    draw_card(pdf, x, y, w, h)
    pdf.setFillColor(BLUE)
    pdf.setFont('Helvetica-Bold', 12)
    pdf.drawString(x + 12, y + h - 20, label)
    pdf.setFillColor(SLATE)
    pdf.setFont('Helvetica', 9)
    text_y = y + h - 36
    for line in text_lines(caption, max(40, int(w/6.8))):
        pdf.drawString(x + 12, text_y, line)
        text_y -= 10
    img_reader = ImageReader(str(image_path))
    iw, ih = img_reader.getSize()
    box_x = x + 12
    box_y = y + 12
    box_w = w - 24
    box_h = h - 70
    dw, dh = fit_rect(iw, ih, box_w, box_h)
    pdf.drawImage(str(image_path), box_x + (box_w - dw)/2, box_y + (box_h - dh)/2, width=dw, height=dh, mask='auto')


def draw_architecture(pdf):
    boxes = [
        (70, 270, 150, 52, 'React UI', 'dashboard, auth, careers'),
        (260, 270, 150, 52, 'Next.js API', 'app/api/** routes'),
        (450, 270, 150, 52, 'PostgreSQL', 'ATS data + migrations'),
        (260, 170, 150, 52, 'BullMQ + Redis', 'async AI match jobs'),
        (450, 170, 150, 52, 'Python matcher', 'deterministic /match'),
    ]
    for x, y, w, h, t1, t2 in boxes:
        pdf.setFillColor(PANEL)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(x, y, w, h, 10, fill=1, stroke=1)
        pdf.setFillColor(NAVY)
        pdf.setFont('Helvetica-Bold', 12)
        pdf.drawCentredString(x + w/2, y + h - 18, t1)
        pdf.setFillColor(SLATE)
        pdf.setFont('Helvetica', 9)
        pdf.drawCentredString(x + w/2, y + 16, t2)
    pdf.setStrokeColor(INDIGO)
    pdf.setLineWidth(1.4)
    lines = [(220, 296, 260, 296), (410, 296, 450, 296), (335, 270, 335, 222), (525, 270, 525, 222), (410, 196, 450, 196)]
    for x1, y1, x2, y2 in lines:
        pdf.line(x1, y1, x2, y2)
    pdf.setFillColor(GREEN)
    pdf.setFont('Helvetica-Bold', 11)
    pdf.drawString(70, 120, 'Data flow')
    draw_bullets(pdf, [
        'UI pages call JSON APIs and render recruiting workflows for admin and recruiter users.',
        'API handlers enforce auth and role/permission rules before reading or writing PostgreSQL data.',
        'Optional matching paths branch into Redis/BullMQ workers or the Python matcher service depending on the action selected.',
        'Public careers pages feed applicants back into the same ATS data model, alerts, and resume-processing pipeline.'
    ], 70, 104, width_chars=92, leading=12)


pages = []
pages.append(('cover', None))
pages.append(('features', None))
pages.append(('architecture', None))
pages.append(('runbook', None))
pages.append(('one', [
    (IMG1 / 'careers.png', 'Public careers portal', 'External hiring page with brand story, role list, and candidate apply actions.'),
]))
pages.append(('two', [
    (IMG1 / 'dashboard-metrics.png', 'Operational dashboard', 'Snapshot of jobs, candidates, applications, funnel conversion, interview load, and HR assistant prompts.'),
    (IMG1 / 'analytics.png', 'Analytics overview', 'Trend charts, funnel, offers, closures, and activity metrics for hiring performance tracking.'),
]))
pages.append(('two', [
    (IMG1 / 'jobs.png', 'Jobs board', 'Dense requisition workspace with filtering, employment type tags, status controls, and portal preview.'),
    (IMG1 / 'candidates.png', 'Candidate database', 'Search-first candidate list with source tags, location, skills, resume links, and action menus.'),
]))
pages.append(('two', [
    (IMG2 / 'job-detail.png', 'Job detail view', 'Single-role page with description, structured metadata, approval workflow, and access into JD/resume matching.'),
    (IMG2 / 'candidate-detail.png', 'Candidate detail view', 'Unified candidate profile with tabs, contact details, skills, resume action, and linked job/application context.'),
]))
pages.append(('two', [
    (IMG1 / 'pipeline.png', 'Pipeline board', 'Stage-oriented workflow for moving applications and seeing recruiting progress in context.'),
    (IMG1 / 'interviews.png', 'Interview desk', 'Scheduling and SLA-focused view for interview operations and recruiter follow-up.'),
]))
pages.append(('three', [
    (IMG2 / 'job-match-hub.png', 'JD/resume match hub', 'Base match workspace showing extracted JD profile, hiring insights, and ranked candidate matches.'),
    (IMG2 / 'job-match-hub-no-ai.png', 'Re-score (No AI) output', 'Result state after the deterministic re-score action, including confirmation banner and refreshed ranking.'),
    (IMG2 / 'job-match-hub-hybrid.png', 'Hybrid recompute output', 'Result state after hybrid recompute, blending bulk No-AI scoring with AI rerank for the top pool.'),
]))
pages.append(('two', [
    (IMG1 / 'copilot.png', 'Recruiter copilot', 'Priority-driven recruiter cockpit highlighting stuck candidates, thin pipelines, and rediscovery opportunities.'),
    (IMG1 / 'screening.png', 'Screening analytics', 'Pass rates, average scores, pending queue, and by-job screening visibility in one compact panel.'),
]))

OUT.parent.mkdir(parents=True, exist_ok=True)
pdf = canvas.Canvas(str(OUT), pagesize=landscape(letter))
pdf.setTitle('AASTHIX Talent - Expanded Team Showcase')
page_no = 1

for kind, payload in pages:
    if kind == 'cover':
        draw_header(pdf, 'AASTHIX Talent - Expanded Team Showcase', 'Repo-backed overview plus live UI captures from an authenticated local admin session.', page_no)
        if LOGO.exists():
            pdf.drawImage(str(LOGO), MARGIN, PAGE_H - 160, width=92, height=92, mask='auto')
        pdf.setFillColor(NAVY)
        pdf.setFont('Helvetica-Bold', 24)
        pdf.drawString(MARGIN + 110, PAGE_H - 108, 'Recruiting operations platform')
        pdf.setFillColor(SLATE)
        pdf.setFont('Helvetica', 11)
        draw_wrapped(pdf, 'This deck combines repo-backed product context with live application screenshots. It is designed to help a team understand what the app is, what workflows it covers, and how the interface supports day-to-day recruiting operations.', MARGIN + 110, PAGE_H - 132, width_chars=92, leading=14, size=11)
        draw_stat_box(pdf, 40, 340, 110, 60, 'Dashboard pages', 17)
        draw_stat_box(pdf, 170, 340, 110, 60, 'API routes', 72, '#E0E7FF')
        draw_stat_box(pdf, 300, 340, 110, 60, 'SQL migrations', 52, '#DCFCE7')
        draw_stat_box(pdf, 430, 340, 110, 60, 'Core modules', 100, '#FEF3C7')
        draw_stat_box(pdf, 560, 340, 110, 60, 'Screens shown', 14, '#FCE7F3')
        pdf.setFillColor(BLUE)
        pdf.setFont('Helvetica-Bold', 13)
        pdf.drawString(40, 300, 'What the app covers')
        draw_bullets(pdf, [
            'Internal ATS workflows: jobs, candidates, applications, pipeline, interviews, clients, chat, admin permissions, analytics, and alerts.',
            'Public hiring intake: branded careers portal, role discovery, application submission, resume ingestion, and confirmation workflows.',
            'Match intelligence: deterministic No-AI scoring, hybrid AI rerank, JD profile extraction, and shortlist-oriented recruiter output.',
            'Operational support: recruiter copilot, workload monitoring, screening analytics, and audit-friendly workflow surfaces.'
        ], 40, 284, width_chars=92)
    elif kind == 'features':
        draw_header(pdf, 'Broader App Summary And Feature Coverage', 'Highlights pulled from routes, components, docs, and service modules in the repo.', page_no)
        draw_card(pdf, 30, 250, 330, 220, 'What it is', None)
        draw_wrapped(pdf, 'AASTHIX Talent is a Next.js-based applicant tracking and recruiting operations system backed by PostgreSQL. Beyond a standard ATS, the repo shows public careers intake, collaboration, analytics, screening workflows, and multiple match/evaluation paths.', 42, 440, width_chars=52, size=10)
        draw_card(pdf, 390, 250, 370, 220, 'Primary users', None)
        draw_bullets(pdf, [
            'Recruiters managing open roles, candidate sourcing, and shortlist movement.',
            'Admins overseeing permissions, invites, and wider system configuration.',
            'Hiring managers and coordinators participating in team-based visibility and interview flow.',
            'External applicants using the public careers portal to browse and apply.'
        ], 402, 440, width_chars=54)
        draw_card(pdf, 30, 70, 730, 150, 'Key capabilities', None)
        draw_bullets(pdf, [
            'Jobs and requisitions: create, update, filter, status-track, and publish openings through a shared jobs board.',
            'Talent management: searchable candidate database, candidate detail views, resume links, and application context.',
            'Pipeline execution: stage movement, interview coordination, SLA visibility, and shortlist operations.',
            'Analytics and insights: dashboard cards, funnel reporting, trend charts, screening analytics, and recruiter-focused summaries.',
            'Communication and governance: chat, activity center, audit views, admin permissions, and approval workflow modules.',
            'Match intelligence: JD extraction, match hub ranking, deterministic re-score, hybrid recompute, and recruiter copilot surfaces.'
        ], 42, 190, width_chars=102)
    elif kind == 'architecture':
        draw_header(pdf, 'Architecture Overview', 'Compact system view based on repo evidence only.', page_no)
        draw_architecture(pdf)
    elif kind == 'runbook':
        draw_header(pdf, 'Getting Started And Operating Notes', 'Minimal setup plus the optional services that power advanced flows.', page_no)
        draw_card(pdf, 32, 250, 350, 210, 'How to run', None)
        draw_bullets(pdf, [
            'Run npm install in the repo root.',
            'Create .env.local from .env.example and set DATABASE_URL, JWT_SECRET, and any SMTP/OpenAI-related values you need.',
            'Provision PostgreSQL and apply the SQL files under migrations/. A dedicated migration runner command was not found in the repo.',
            'Start the app with npm run dev and open the local URL.',
            'Use the built-in auth flows or test credentials to access admin and recruiter screens.'
        ], 44, 435, width_chars=49)
        draw_card(pdf, 410, 250, 350, 210, 'Optional services', None)
        draw_bullets(pdf, [
            'matcher-service: Python /match endpoint for deterministic No-AI scoring.',
            'Redis + BullMQ worker: queue-backed async analyze flow for larger AI matching runs.',
            'OpenAI/vector settings: enable higher-end matching and embeddings through env flags in .env.example.',
            'SMTP settings: support interview reminders and careers confirmation email flows.'
        ], 422, 435, width_chars=49)
        draw_card(pdf, 32, 80, 728, 130, 'Notes for this deck', None)
        draw_bullets(pdf, [
            'The screenshot pages were captured from the live local app using the provided admin credentials.',
            'The match-hub pages include visible output states after clicking Re-score (No AI) and Hybrid recompute.',
            'UI data can change over time because the views are backed by your live local database and current seeded/test content.'
        ], 44, 185, width_chars=102)
    elif kind == 'one':
        draw_header(pdf, 'Public Experience', 'External-facing surface shown to candidates.', page_no)
        img, label, cap = payload[0]
        draw_image_card(pdf, 30, 48, PAGE_W - 60, PAGE_H - 120, img, label, cap)
    elif kind == 'two':
        draw_header(pdf, 'UI Walkthrough', 'Representative product screens selected for clarity and coverage.', page_no)
        gap = 18
        card_w = (PAGE_W - (MARGIN * 2) - gap) / 2
        card_h = PAGE_H - 126
        x1 = MARGIN
        x2 = MARGIN + card_w + gap
        y = 40
        (i1, l1, c1), (i2, l2, c2) = payload
        draw_image_card(pdf, x1, y, card_w, card_h, i1, l1, c1)
        draw_image_card(pdf, x2, y, card_w, card_h, i2, l2, c2)
    elif kind == 'three':
        draw_header(pdf, 'Match Intelligence Screens', 'Deeper workflow detail for JD/resume analysis and re-ranking actions.', page_no)
        gap = 12
        card_w = (PAGE_W - (MARGIN * 2) - (gap * 2)) / 3
        card_h = PAGE_H - 126
        y = 40
        for idx, (img, label, cap) in enumerate(payload):
            x = MARGIN + idx * (card_w + gap)
            draw_image_card(pdf, x, y, card_w, card_h, img, label, cap)
    pdf.showPage()
    page_no += 1

pdf.save()
reader = PdfReader(str(OUT))
print(OUT)
print(len(reader.pages))
if len(reader.pages) < 10:
    raise RuntimeError(f'Expected at least 10 pages, found {len(reader.pages)}')

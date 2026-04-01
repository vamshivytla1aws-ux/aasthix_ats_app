from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'pdf' / 'ats-app-ui-showcase.pdf'
IMG = ROOT / 'tmp' / 'pdfs' / 'ui-captures'
LOGO = ROOT / 'public' / 'brand-logo.png'
PAGE_W, PAGE_H = landscape(letter)
MARGIN = 28
CONTENT_W = PAGE_W - MARGIN * 2
CONTENT_H = PAGE_H - MARGIN * 2

NAVY = HexColor('#0F172A')
BLUE = HexColor('#1D4ED8')
SLATE = HexColor('#475569')
LINE = HexColor('#CBD5E1')
PANEL = HexColor('#F8FAFC')
ACCENT = HexColor('#4F46E5')

PAGES = [
    {
        'title': 'AASTHIX Talent UI Showcase',
        'subtitle': 'Selected application screens captured from the live local app on March 28, 2026 using an authenticated admin session.',
        'layout': 'hero',
        'images': [
            {
                'file': IMG / 'careers.png',
                'label': 'Public careers portal',
                'caption': 'Branded hiring landing page with company positioning, open roles, and direct application actions.'
            }
        ]
    },
    {
        'title': 'Overview And Intelligence',
        'subtitle': 'Executive-ready surfaces for quick monitoring and decision support.',
        'layout': 'grid2',
        'images': [
            {
                'file': IMG / 'dashboard-metrics.png',
                'label': 'Operational dashboard',
                'caption': 'Key counts, funnel conversion, interview load, HR assistant prompts, and quick actions.'
            },
            {
                'file': IMG / 'analytics.png',
                'label': 'Analytics overview',
                'caption': 'Hiring funnel, trend chart, quick stats, and activity summary in one analytics workspace.'
            },
        ]
    },
    {
        'title': 'Core Recruiting Workspace',
        'subtitle': 'Structured data views for daily recruiting operations.',
        'layout': 'grid2',
        'images': [
            {
                'file': IMG / 'jobs.png',
                'label': 'Jobs board',
                'caption': 'Openings table with status controls, portal preview, filtering, and quick job actions.'
            },
            {
                'file': IMG / 'candidates.png',
                'label': 'Candidate database',
                'caption': 'Searchable talent pool with filters, skills, source tags, resume links, and record actions.'
            },
        ]
    },
    {
        'title': 'Workflow Execution',
        'subtitle': 'Pipeline movement and interview management for active hiring cycles.',
        'layout': 'grid2',
        'images': [
            {
                'file': IMG / 'pipeline.png',
                'label': 'Pipeline board',
                'caption': 'Stage-based application flow with add-to-board controls, filters, and visible candidate cards.'
            },
            {
                'file': IMG / 'interviews.png',
                'label': 'Interview desk',
                'caption': 'Interview metrics, schedules, SLA indicators, and row-level follow-up actions.'
            },
        ]
    },
    {
        'title': 'Recruiter Productivity',
        'subtitle': 'Decision support and follow-up workflows layered on top of the ATS.',
        'layout': 'grid2',
        'images': [
            {
                'file': IMG / 'copilot.png',
                'label': 'Recruiter copilot',
                'caption': 'A guided priorities screen highlighting interviews, stuck candidates, thin pipelines, and rediscovery prompts.'
            },
            {
                'file': IMG / 'screening.png',
                'label': 'Screening analytics',
                'caption': 'Pass rates, average scores, completion timing, pending queue, and by-job screening visibility.'
            },
        ]
    },
]


def fit_rect(img_w, img_h, box_w, box_h):
    scale = min(box_w / img_w, box_h / img_h)
    return img_w * scale, img_h * scale


def draw_header(pdf, title, subtitle, page_num):
    pdf.setFillColor(NAVY)
    pdf.rect(0, PAGE_H - 52, PAGE_W, 52, fill=1, stroke=0)
    if LOGO.exists():
        pdf.drawImage(str(LOGO), MARGIN, PAGE_H - 42, width=22, height=22, mask='auto')
    pdf.setFillColor(white)
    pdf.setFont('Helvetica-Bold', 20)
    pdf.drawString(MARGIN + 30, PAGE_H - 24, title)
    pdf.setFont('Helvetica', 9.5)
    pdf.drawString(MARGIN, PAGE_H - 66, subtitle)
    pdf.setFillColor(SLATE)
    pdf.setFont('Helvetica', 8.5)
    pdf.drawRightString(PAGE_W - MARGIN, 16, f'Page {page_num}')


def draw_card(pdf, x, y, w, h, image_path, label, caption):
    pdf.setFillColor(white)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(x, y, w, h, 12, fill=1, stroke=1)

    img_reader = ImageReader(str(image_path))
    img_w, img_h = img_reader.getSize()
    inner_x = x + 12
    inner_y = y + 68
    inner_w = w - 24
    inner_h = h - 82
    draw_w, draw_h = fit_rect(img_w, img_h, inner_w, inner_h)
    img_x = inner_x + (inner_w - draw_w) / 2
    img_y = inner_y + (inner_h - draw_h) / 2
    pdf.drawImage(str(image_path), img_x, img_y, width=draw_w, height=draw_h, mask='auto')

    pdf.setFillColor(BLUE)
    pdf.setFont('Helvetica-Bold', 12)
    pdf.drawString(x + 12, y + h - 22, label)
    pdf.setFillColor(SLATE)
    pdf.setFont('Helvetica', 9)
    text = pdf.beginText(x + 12, y + h - 38)
    text.setLeading(11)
    for line in wrap_text(caption, 58):
        text.textLine(line)
    pdf.drawText(text)


def wrap_text(text, width):
    words = text.split()
    lines = []
    current = []
    length = 0
    for word in words:
        extra = len(word) + (1 if current else 0)
        if length + extra > width:
            lines.append(' '.join(current))
            current = [word]
            length = len(word)
        else:
            current.append(word)
            length += extra
    if current:
        lines.append(' '.join(current))
    return lines


def draw_hero(pdf, page):
    image = page['images'][0]
    x = MARGIN
    y = 54
    w = CONTENT_W
    h = PAGE_H - 140
    draw_card(pdf, x, y, w, h, image['file'], image['label'], image['caption'])
    pdf.setFillColor(PANEL)
    pdf.roundRect(PAGE_W - 220, PAGE_H - 98, 192, 38, 10, fill=1, stroke=0)
    pdf.setFillColor(ACCENT)
    pdf.setFont('Helvetica-Bold', 10)
    pdf.drawString(PAGE_W - 205, PAGE_H - 75, 'Professional showcase set')
    pdf.setFillColor(SLATE)
    pdf.setFont('Helvetica', 8.5)
    pdf.drawString(PAGE_W - 205, PAGE_H - 88, 'Public + internal admin views')


def draw_grid2(pdf, page):
    gap = 16
    card_w = (CONTENT_W - gap) / 2
    card_h = PAGE_H - 146
    x1 = MARGIN
    x2 = MARGIN + card_w + gap
    y = 52
    draw_card(pdf, x1, y, card_w, card_h, page['images'][0]['file'], page['images'][0]['label'], page['images'][0]['caption'])
    draw_card(pdf, x2, y, card_w, card_h, page['images'][1]['file'], page['images'][1]['label'], page['images'][1]['caption'])


OUT.parent.mkdir(parents=True, exist_ok=True)
pdf = canvas.Canvas(str(OUT), pagesize=landscape(letter))
pdf.setTitle('AASTHIX Talent UI Showcase')

for idx, page in enumerate(PAGES, start=1):
    draw_header(pdf, page['title'], page['subtitle'], idx)
    if page['layout'] == 'hero':
        draw_hero(pdf, page)
    else:
        draw_grid2(pdf, page)
    pdf.showPage()

pdf.save()
reader = PdfReader(str(OUT))
if len(reader.pages) != 5:
    raise RuntimeError(f'Expected 5 pages, found {len(reader.pages)}')
print(OUT)
print(len(reader.pages))

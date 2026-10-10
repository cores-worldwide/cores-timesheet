#!/usr/bin/env python3
"""Build the office "What's New" bulletin from one content file.

    python3 scripts/whats-new.py edition.json --out DIR

Writes to DIR:
  whats-new-<issued>.html  the page (published as an artifact; prints well too)
  whats-new-<issued>.pdf   PDF to forward (built-in Helvetica, nothing embedded, ~10 KB)

edition.json:
  {
    "issued": "2026-10-09",                       # YYYY-MM-DD, used in file names
    "period": "Sep 26 - Oct 9, 2026",
    "audience": "For Niki and Tracy, from Jim",
    "intro": "...",
    "crew":   [{"title": "", "date": "Sep 29", "body": "", "say": "", "say_label": "Say to the crew"}],
    "office": [{"group": "SMS Review", "items": [{"title": "", "date": "", "body": ""}]}],
    "behind": ["..."],
    "foot": "Questions about any of this? Ask Jim."
  }
"crew", "office" and "behind" may be empty lists; empty sections are left out.

Content files and output live in docs/whats-new/ (one JSON per issue).
"""
import argparse
import html
import json
import os
import re
import sys

# ── colours (match the page) ──
INK, MUTED, RULE = '#16232c', '#5b6a73', '#d8dee1'
ACCENT = '#c94f1c'
CREW, CREW_TINT = '#0b6f6e', '#e4f2f1'
OFFICE, OFFICE_TINT = '#34508a', '#e8edf7'
SAY_BG, SAY_RULE = '#fff7ef', '#f0c9a8'


def load(path):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    for k in ('issued', 'period'):
        if not d.get(k):
            sys.exit(f'edition.json is missing "{k}"')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d['issued']):
        sys.exit('"issued" must be YYYY-MM-DD')
    d.setdefault('audience', 'For Niki and Tracy, from Jim')
    d.setdefault('intro', '')
    d.setdefault('crew', [])
    d.setdefault('office', [])
    d.setdefault('behind', [])
    d.setdefault('foot', 'Questions about any of this? Ask Jim.')
    return d


e = html.escape


def issued_label(d):
    import datetime
    t = datetime.date.fromisoformat(d['issued'])
    return f"{t.strftime('%b')} {t.day}, {t.year}"


# ─────────────────────────── page HTML ───────────────────────────
PAGE_CSS = r'''
/* Layout: one narrow reading column, like a printed office bulletin. Two audience bands (crew / office), each item = what changed + what to do. */
:root {
  --bg: #f6f7f7; --paper: #ffffff; --ink: #16232c; --muted: #5b6a73; --rule: #d8dee1;
  --accent: #c94f1c; --crew: #0b6f6e; --crew-tint: #e4f2f1; --office: #34508a; --office-tint: #e8edf7;
  --say-bg: #fff7ef; --say-rule: #f0c9a8;
  --display: "Archivo", "Arial Narrow", "Helvetica Neue", Arial, sans-serif;
  --body: "Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #11181d; --paper: #172128; --ink: #e6ecef; --muted: #9aa9b1; --rule: #2c3a42;
  --accent: #ee7a45; --crew: #5cc4c1; --crew-tint: #173332; --office: #9db4ea; --office-tint: #1d2840;
  --say-bg: #2a2119; --say-rule: #6b4a30; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #11181d; --paper: #172128; --ink: #e6ecef; --muted: #9aa9b1; --rule: #2c3a42;
  --accent: #ee7a45; --crew: #5cc4c1; --crew-tint: #173332; --office: #9db4ea; --office-tint: #1d2840;
  --say-bg: #2a2119; --say-rule: #6b4a30; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 16px/1.5 var(--body); }
.sheet { max-width: 46rem; margin: 0 auto; padding-inline: 16px; padding-block: 24px 48px; }
.paper { background: var(--paper); border: 1px solid var(--rule); border-top: 6px solid var(--accent); padding: 28px clamp(16px, 4vw, 40px) 36px; }
.mast { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 16px; border-bottom: 2px solid var(--ink); padding-bottom: 10px; }
.mast h1 { font-family: var(--display); font-stretch: 80%; font-weight: 800; font-size: 2.1rem; line-height: 1; letter-spacing: .01em; margin: 0; text-transform: uppercase; }
.mast .issue { font-family: var(--mono); font-size: .8rem; color: var(--muted); text-align: right; line-height: 1.5; }
.for { margin: 10px 0 0; color: var(--muted); font-size: .95rem; }
.intro { margin: 18px 0 0; max-width: 62ch; }
.band { margin-top: 30px; }
.band-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; padding: 8px 12px; }
.band-head h2 { font-family: var(--display); font-stretch: 85%; font-weight: 700; font-size: 1.15rem; letter-spacing: .06em; text-transform: uppercase; margin: 0; }
.band-head p { margin: 0; font-size: .92rem; color: var(--muted); }
.crew .band-head { background: var(--crew-tint); border-left: 5px solid var(--crew); }
.crew .band-head h2 { color: var(--crew); }
.office .band-head { background: var(--office-tint); border-left: 5px solid var(--office); }
.office .band-head h2 { color: var(--office); }
.group { margin: 18px 0 0; font-family: var(--display); font-stretch: 90%; font-weight: 600; font-size: .78rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--rule); padding-bottom: 3px; }
.item { padding: 12px 0; border-bottom: 1px solid var(--rule); break-inside: avoid; }
.item:last-child { border-bottom: 0; }
.item h3 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 0 0 4px; font-size: 1.05rem; font-weight: 700; line-height: 1.3; text-wrap: balance; }
.date { font-family: var(--mono); font-size: .72rem; font-weight: 500; color: var(--ink); background: var(--bg); border: 1px solid var(--rule); border-radius: 3px; padding: 1px 6px; white-space: nowrap; }
.item p { margin: 0 0 6px; max-width: 64ch; }
.item p:last-child { margin-bottom: 0; }
.say { margin: 8px 0 0; padding: 8px 12px; background: var(--say-bg); border-left: 3px solid var(--say-rule); font-size: .95rem; max-width: 64ch; }
.say .lbl { display: block; font-family: var(--display); font-stretch: 85%; font-weight: 700; font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
.quiet { margin-top: 30px; padding-top: 12px; border-top: 2px solid var(--ink); }
.quiet h2 { font-family: var(--display); font-stretch: 85%; font-weight: 700; font-size: .95rem; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 6px; }
.quiet ul { margin: 0; padding-left: 1.1rem; color: var(--muted); font-size: .93rem; display: grid; gap: 3px; }
.foot { margin-top: 22px; font-size: .82rem; color: var(--muted); }
@media print {
  :root { --bg:#fff; --paper:#fff; --ink:#16232c; --muted:#5b6a73; --rule:#d8dee1; --accent:#c94f1c; --crew:#0b6f6e; --crew-tint:#e4f2f1; --office:#34508a; --office-tint:#e8edf7; --say-bg:#fff7ef; --say-rule:#f0c9a8; color-scheme: light; }
  @page { size: letter; margin: 0.5in 0.55in; }
  body { font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: none; padding: 0; }
  .paper { border: 0; border-top: 6px solid var(--accent); padding: 14px 0 0; }
  .band-head, .group { break-after: avoid; }
}
'''


def page_html(d):
    out = ['<title>Cores Timesheet Update</title>',
           '<link rel="preconnect" href="https://fonts.googleapis.com">',
           '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800'
           '&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@500&display=swap">',
           f'<style>{PAGE_CSS}</style>',
           '<main class="sheet"><article class="paper">',
           '<header class="mast"><h1>What\'s New</h1>'
           f'<span class="issue">Cores Timesheet · {e(d["period"])}<br>Issued {e(issued_label(d))}</span></header>',
           f'<p class="for">{e(d["audience"])}</p>']
    if d['intro']:
        out.append(f'<p class="intro">{e(d["intro"])}</p>')

    def item(it):
        s = [f'<div class="item"><h3>{e(it["title"])}'
             + (f' <span class="date">In effect {e(it["date"])}</span>' if it.get('date') else '') + '</h3>',
             f'<p>{e(it.get("body", ""))}</p>']
        if it.get('say'):
            s.append(f'<div class="say"><span class="lbl">{e(it.get("say_label") or "Say to the crew")}</span>'
                     f'{e(it["say"])}</div>')
        s.append('</div>')
        return ''.join(s)

    if d['crew']:
        out.append('<section class="band crew"><div class="band-head"><h2>Tell the techs</h2>'
                   '<p>Things the crew will notice, with a line you can send them</p></div>')
        out += [item(it) for it in d['crew']]
        out.append('</section>')
    if any(g.get('items') for g in d['office']):
        out.append('<section class="band office"><div class="band-head"><h2>For the office</h2>'
                   '<p>Changes to the screens you use. Nothing to tell the crew.</p></div>')
        for g in d['office']:
            if not g.get('items'):
                continue
            out.append(f'<div class="group">{e(g["group"])}</div>')
            out += [item(it) for it in g['items']]
        out.append('</section>')
    if d['behind']:
        out.append('<section class="quiet"><h2>Behind the scenes</h2><ul>'
                   + ''.join(f'<li>{e(b)}</li>' for b in d['behind']) + '</ul></section>')
    out.append(f'<p class="foot">{e(d["foot"])}</p></article></main>')
    return '\n'.join(out) + '\n'


# ─────────────────────────── PDF ───────────────────────────
def pdf_text(t):
    """Built-in Helvetica only covers Windows-1252: drop symbols it can't draw (emoji, check marks)."""
    t = ''.join(c for c in t if c.encode('cp1252', 'ignore'))
    t = re.sub(r'\(\s*\)', '', t)
    return e(re.sub(r'\s{2,}', ' ', t).strip())


def build_pdf(d, path):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

    C = colors.HexColor
    body = ParagraphStyle('body', fontName='Helvetica', fontSize=10, leading=13.5, textColor=C(INK))
    muted = ParagraphStyle('muted', parent=body, textColor=C(MUTED), fontSize=9.5)
    title = ParagraphStyle('title', parent=body, fontName='Helvetica-Bold', fontSize=10.5, leading=13.5, spaceAfter=2)
    lbl = ParagraphStyle('lbl', parent=body, fontName='Helvetica-Bold', fontSize=7, leading=9, textColor=C(MUTED))
    group = ParagraphStyle('group', parent=lbl, fontSize=7.5, spaceBefore=8)
    W = letter[0] - 1.1 * inch

    def rule(color=RULE, w=0.6):
        t = Table([['']], colWidths=[W], rowHeights=[2])
        t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), w, C(color))]))
        return t

    def band(text, sub, col, tint):
        p = Paragraph(f'<font name="Helvetica-Bold" color="{col}" size="11">{text}</font>'
                      f'&nbsp;&nbsp;&nbsp;<font color="{MUTED}" size="9">{pdf_text(sub)}</font>', body)
        t = Table([[p]], colWidths=[W])
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C(tint)),
                               ('LINEBEFORE', (0, 0), (0, -1), 4, C(col)),
                               ('LEFTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 5),
                               ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
        return t

    def item(it, last=False):
        head = pdf_text(it['title'])
        if it.get('date'):
            head += f'&nbsp;&nbsp;<font name="Helvetica" size="8" color="{MUTED}">In effect {pdf_text(it["date"])}</font>'
        parts = [Spacer(1, 6), Paragraph(head, title), Paragraph(pdf_text(it.get('body', '')), body)]
        if it.get('say'):
            box = Table([[[Paragraph(pdf_text((it.get('say_label') or 'Say to the crew').upper()), lbl),
                           Paragraph(pdf_text(it['say']), body)]]], colWidths=[W - 12])
            box.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C(SAY_BG)),
                                     ('LINEBEFORE', (0, 0), (0, -1), 2.5, C(SAY_RULE)),
                                     ('LEFTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 4),
                                     ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
            parts += [Spacer(1, 5), box]
        parts.append(Spacer(1, 6))
        if not last:
            parts.append(rule())
        return KeepTogether(parts)

    story = []
    mast = ParagraphStyle('mast', parent=body, fontName='Helvetica-Bold', fontSize=20, leading=24)
    top = Table([[Paragraph('WHAT\'S NEW', mast),
                  Paragraph(f'<para alignment="right"><font size="8.5" color="{MUTED}">Cores Timesheet · '
                            f'{pdf_text(d["period"])}<br/>Issued {pdf_text(issued_label(d))}</font></para>', body)]],
                colWidths=[W * 0.45, W * 0.55])
    top.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, 0), 4, C(ACCENT)), ('LINEBELOW', (0, 0), (-1, -1), 1.4, C(INK)),
                             ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                             ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 10),
                             ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    story += [top, Spacer(1, 6), Paragraph(pdf_text(d['audience']), muted)]
    if d['intro']:
        story += [Spacer(1, 8), Paragraph(pdf_text(d['intro']), body)]

    if d['crew']:
        story += [Spacer(1, 14), band('TELL THE TECHS', 'Things the crew will notice, with a line you can send them',
                                      CREW, CREW_TINT)]
        story += [item(it, i == len(d['crew']) - 1) for i, it in enumerate(d['crew'])]
    groups = [g for g in d['office'] if g.get('items')]
    if groups:
        story += [Spacer(1, 14), band('FOR THE OFFICE', 'Changes to the screens you use. Nothing to tell the crew.',
                                      OFFICE, OFFICE_TINT)]
        for g in groups:
            story += [Paragraph(pdf_text(g['group'].upper()), group), rule()]
            story += [item(it, i == len(g['items']) - 1) for i, it in enumerate(g['items'])]
    if d['behind']:
        story += [Spacer(1, 12), rule(INK, 1.4), Spacer(1, 4),
                  Paragraph('<font name="Helvetica-Bold">BEHIND THE SCENES</font>', body), Spacer(1, 3)]
        story += [Paragraph(pdf_text(b), muted, bulletText='•') for b in d['behind']]
    story += [Spacer(1, 14), Paragraph(pdf_text(d['foot']), muted)]

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(C(MUTED))
        canvas.drawRightString(letter[0] - 0.55 * inch, 0.4 * inch, f'What\'s New · {d["period"]} · page {doc.page}')
        canvas.restoreState()

    doc = SimpleDocTemplate(path, pagesize=letter, leftMargin=0.55 * inch, rightMargin=0.55 * inch,
                            topMargin=0.5 * inch, bottomMargin=0.6 * inch,
                            title=f"What's New - Cores Timesheet - {d['period']}", author='Jim Jardine')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('edition')
    ap.add_argument('--out', default='.')
    a = ap.parse_args()
    d = load(a.edition)
    os.makedirs(a.out, exist_ok=True)
    stem = os.path.join(a.out, f'whats-new-{d["issued"]}')
    with open(stem + '.html', 'w', encoding='utf-8') as f:
        f.write(page_html(d))
    build_pdf(d, stem + '.pdf')
    print(f'{stem}.html\n{stem}.pdf ({os.path.getsize(stem + ".pdf"):,} bytes)')


if __name__ == '__main__':
    main()

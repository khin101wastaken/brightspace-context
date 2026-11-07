"""Generate original, fictional reviewer files. Build-only dependencies: python-docx, python-pptx, reportlab.
Run: python scripts/generate-demo-documents.py (or add .cache/demo-python to sys.path).
All prose below is project-authored and MIT-licensed. Never use real course files here.
"""
import io, sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0, str(Path('.cache/demo-python').resolve()))
from docx import Document
from pptx import Presentation
from reportlab.pdfgen.canvas import Canvas
out=Path('companion/demo-assets');out.mkdir(exist_ok=True)
# A real PDF with a text layer, rather than a header-only validator fixture.
c=Canvas(str(out/'field-guide.pdf'),pagesize=(612,792),invariant=1)
c.setTitle('Demo field guide: urban garden');c.setAuthor('Brightspace Context Demo')
c.setFont('Helvetica-Bold',20);c.drawString(50,730,'Urban Garden: Field Guide')
c.setFont('Helvetica',12)
lines=['Fictional course material for Brightspace Context.','',
'The garden experiment compares two watering schedules.',
'Plot A receives 2 liters every morning; Plot B receives 2 liters every other day.',
'Each plot contains six basil plants and uses the same soil mix.',
'Measure soil moisture at 09:00 each Tuesday for four weeks.',
'The success threshold is an average soil moisture of at least 35 percent.',
'',
'Reading check: Plot A receives 14 liters per week.',
'The field observation code is CEDAR-42.',
'',
'These are invented teaching examples, not gardening recommendations.']
for i,line in enumerate(lines):c.drawString(50,690-i*22,line)
c.showPage();c.save()
d=Document();d.core_properties.author='Brightspace Context Demo';d.core_properties.last_modified_by='Brightspace Context Demo';d.core_properties.created=datetime(2026,1,1,tzinfo=timezone.utc);d.core_properties.modified=d.core_properties.created
d.add_heading('Observation worksheet',0);d.add_paragraph('Fictional course material for Brightspace Context.')
d.add_heading('Before the visit',1);d.add_paragraph('Bring a notebook, a ruler, and a refillable water bottle. Meet at the east gate at 09:00 on Tuesday.')
d.add_heading('Record your observations',1);d.add_paragraph('Record plant height in centimeters and soil moisture as a percentage for all six plants in your assigned plot. Take readings before watering.')
d.add_paragraph('The worksheet check phrase is MAPLE-17. Submit a 150-word observation note in the fictional class discussion; this extension does not submit assignments.')
d.save(out/'observation-worksheet.docx')
p=Presentation();p.core_properties.author='Brightspace Context Demo';p.core_properties.last_modified_by='Brightspace Context Demo';p.core_properties.created=datetime(2026,1,1);p.core_properties.modified=p.core_properties.created
for title,body in [('Designing a fair experiment','Fictional course material for Brightspace Context.\nChange one factor at a time: the watering schedule.\nKeep soil mix, plant variety, and sunlight comparable.'),('What to measure','Measure every Tuesday at 09:00, before watering.\nTrack soil moisture and plant height for four weeks.\nThe slide deck check phrase is WILLOW-28.')]:
 slide=p.slides.add_slide(p.slide_layouts[1]);slide.shapes.title.text=title;slide.placeholders[1].text=body
p.save(out/'fair-experiment.pptx')
print('Generated three original PDF/PPTX/DOCX demo documents.')

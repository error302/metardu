from pathlib import Path
import zipfile
import sys
sys.path.insert(0, str(Path('live-test-results/python-deps').resolve()))
import fitz
root = Path('live-test-results/pdf-review')
root.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile('live-test-results/verified-survey-package.zip') as package:
 for entry in package.namelist():
  if not entry.endswith('.pdf'): continue
  doc = fitz.open(stream=package.read(entry), filetype='pdf')
  overflow = []
  for i, page in enumerate(doc):
   for word in page.get_text('words'):
    if word[0] < 0 or word[1] < 0 or word[2] > page.rect.width + 1 or word[3] > page.rect.height + 1:
     overflow.append((i+1, word[4]))
   page.get_pixmap(matrix=fitz.Matrix(1,1)).save(root / (Path(entry).stem + '-' + str(i+1) + '.png'))
  print(Path(entry).name, 'pages=', len(doc), 'overflow=', overflow[:10])

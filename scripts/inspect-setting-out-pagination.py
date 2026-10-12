from pathlib import Path
import json
import re
import sys
import pypdf
import pdfplumber

source = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/setting-out-pagination/synthetic-setting-out-sheet.pdf').resolve()
pages = pypdf.PdfReader(source).pages
texts = [page.extract_text() or '' for page in pages]
text = '\n'.join(texts)
for i in range(1, 51):
    expected = f'SYN-{i:03d}'
    assert len(re.findall(r'\b' + expected + r'\b', text)) == 1, ('Missing or duplicated design point', expected)
for i, value in enumerate(texts, 1):
    assert 'DRAFT' in value and f'Page {i} of {len(pages)}' in value
    assert 'Design E' in value and 'Design N' in value
    assert 'control' in value.lower() and 'not verified' in value.lower()
assert 'continued on next page' not in text
violations = []
with pdfplumber.open(source) as doc:
    for i, page in enumerate(doc.pages, 1):
        assert abs(page.width - 595.28) < 2 and abs(page.height - 841.89) < 2
        for char in page.chars:
            if char['text'].strip() and (char['x0'] < 27 or char['x1'] > page.width - 27 or char['top'] < 27 or char['bottom'] > page.height - 27):
                violations.append((i, char['text']))
assert not violations, violations[:10]
result = {'synthetic': True, 'caller': 'generateDocumentSafe(setting-out)', 'pages': len(pages), 'all50PointsExactlyOnce': True, 'a4Portrait': True,
          'repeatedHeadersAndPageNumbers': True, 'textWithinMargins': True, 'sourceOnly': True, 'fieldProof': False}
(source.parent / 'inspection.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))

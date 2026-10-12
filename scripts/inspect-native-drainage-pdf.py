from pathlib import Path
import json
import re
import sys
import pypdf
import pdfplumber

source = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/drainage-native-pdf/synthetic-drainage-deliverable.pdf').resolve()
pages = pypdf.PdfReader(source).pages
texts = [page.extract_text() or '' for page in pages]
all_text = '\n'.join(texts)
assert len(pages) >= 1
for index, (page, text) in enumerate(zip(pages, texts), 1):
    assert abs(float(page.mediabox.width) - 841.89) < 2 and abs(float(page.mediabox.height) - 595.28) < 2
    for expected in ['DRAFT', f'Page {index} of {len(pages)}', 'Legend: PASS=', 'No construction acceptance.', 'Definition']:
        assert expected in text, (index, expected)
    assert not page.get('/Annots'), 'PDF must not contain active links or annotations'
    assert len(text) > 100, 'Blank or near-blank page'
for expected in ['500000.00321', '100.0054', '+0.0032', '+0.0054', 'NOT ASSESSED', 'FAIL', 'Pipe chainage:', 'Fall: 1 m; gradient: 1%', 'EPSG:21037', 'Synthetic benchmark BM-01']:
    assert expected in all_text, expected
assert 'EPSG:21036' not in all_text, 'Current edited CRS must not replace capture CRS'
if source.parent.name == 'drainage-native-pdf':
    for expected in ['Chainage: 1250 m', 'LEGACY-UNVERIFIED', 'observation-024', 'R1', 'R2', 'Capture CRS was not confirmed', 'SYNTHETIC LONG NOTE']:
        assert expected in all_text, expected
    # Extracted text inserts line/page headers inside wrapped phrases. Count every
    # distinctive word rather than treating layout line breaks as lost text.
    for word in ['must', 'remain', 'readable', 'across', 'boundaries']:
        assert len(re.findall(r'\b' + word + r'\b', all_text)) == 90, ('Long-note word lost or duplicated', word)
    assert len(pages) >= 3
if source.parent.name == 'drainage-pdf-source-http':
    fixture = json.loads((source.parent / 'result.json').read_text(encoding='utf-8-sig'))
    assert fixture['passed'] is True and fixture['expectedChecks'] == 28
    assert fixture['projectId'] in all_text and fixture['definitionId'] in all_text
violations = []
with pdfplumber.open(source) as document:
    for index, page in enumerate(document.pages, 1):
        for char in page.chars:
            if char['text'].strip() and (char['x0'] < 27 or char['x1'] > page.width - 27 or char['top'] < 27 or char['bottom'] > page.height - 27):
                violations.append({'page': index, 'character': char['text'], 'x0': char['x0'], 'x1': char['x1'], 'top': char['top'], 'bottom': char['bottom']})
assert not violations, violations[:10]
reader = pypdf.PdfReader(source)
assert not reader.trailer['/Root'].get('/OpenAction') and not reader.trailer['/Root'].get('/AA')
result = {'synthetic': True, 'source': str(source), 'pages': len(pages), 'a4Landscape': True,
          'originalCoordinatesAndOffsetsPreserved': True, 'capturedReferencePreserved': True,
          'draftAndLegendOnEveryPage': True, 'pageNumbersComplete': True, 'textInsideMargins': True,
          'activeContentAbsent': True, 'fieldInstrumentProof': False, 'productionProof': False}
if source.parent.name == 'drainage-native-pdf':
    result['longNoteDistinctiveWordsPreserved'] = True
if source.parent.name == 'drainage-pdf-source-http':
    result['fixtureProjectId'] = fixture['projectId']
    result['fixtureDefinitionId'] = fixture['definitionId']
(source.parent / 'native-pdf-inspection.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))

"""Independent native inspection of the labelled post-promotion HTTP fixture."""
from pathlib import Path
import hashlib
import json
import sys
import pypdf
import pdfplumber

notice_worker = '--notice-worker-source' in sys.argv
root = Path('test-results/notice-worker-release' if notice_worker else 'test-results/workflow-source-release')
promotion = json.loads((root / 'promotion.json').read_text(encoding='utf-8-sig'))
http = json.loads((root / 'normal-account-http.json').read_text(encoding='utf-8-sig'))
assert promotion['status'] == 'promoted'
expected = 46 if notice_worker else 35
assert http['status'] == 'passed' and http['expectedChecks'] == expected
assert len(http['checks']) == expected and all(check['passed'] is True for check in http['checks'])
assert http['imageId'] == promotion['applicationAfter']['image']
assert http['customerFixturesModified'] is False
assert http['cleanup']['syntheticAccountsDisabled'] is True
assert http['cleanup']['syntheticUploadRemoved'] is True
source = root / 'synthetic-production-drainage.pdf'
digest = hashlib.sha256(source.read_bytes()).hexdigest()
assert digest == http['syntheticDrainagePdfSha256']
reader = pypdf.PdfReader(source)
assert len(reader.pages) == 2
texts = [page.extract_text() or '' for page in reader.pages]
text = '\n'.join(texts)
for item in ['100.0054', '500000.00321', '+0.0032', '+0.0054', 'NOT ASSESSED', 'FAIL', 'EPSG:32636', 'Synthetic benchmark BM-01', 'Fall: 1 m; gradient: 1%', http['syntheticProjectId'], http['syntheticDrainageDefinitionId']]:
    assert item in text, item
for index, (page, text) in enumerate(zip(reader.pages, texts), 1):
    assert abs(float(page.mediabox.width) - 841.89) < 2
    assert abs(float(page.mediabox.height) - 595.28) < 2
    for item in ['DRAFT - SAVED SET-OUT HISTORY', 'Legend: PASS=', 'No construction acceptance.', f'Page {index} of 2', http['syntheticProjectId'], http['syntheticDrainageDefinitionId']]:
        assert item in text, item
    assert not page.get('/Annots')
assert not reader.trailer['/Root'].get('/OpenAction')
assert not reader.trailer['/Root'].get('/AA')
with pdfplumber.open(source) as document:
    for number, page in enumerate(document.pages, 1):
        for char in page.chars:
            assert char['x0'] >= 20 and char['x1'] <= page.width - 20, (number, 'horizontal margin')
            assert char['top'] >= 15 and char['bottom'] <= page.height - 15, (number, 'vertical margin')
report = {'scope': 'Actual promoted production HTTP output with labelled synthetic inputs', 'imageId': http['imageId'], 'releaseId': promotion['health']['releaseId'], 'sha256': digest, 'pages': 2, 'a4Landscape': True, 'preciseCapturesAndUnknownHeightPreserved': True, 'revisionedGradeRetained': True, 'fixtureAssociationVerified': True, 'draftAndLegendOnEveryPage': True, 'textInsideMargins': True, 'activeContentAbsent': True, 'customerFixturesModified': False, 'fieldInstrumentProof': False}
(root / 'production-drainage-inspection.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))

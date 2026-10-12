"""Inspect an upload archive from stdin; caller captures this private manifest.

No extraction or filesystem write. Reject traversal, links and duplicate paths.
Only the aggregate comparison result is retained by the recovery orchestrator.
"""
import hashlib
import io
import json
import sys
import tarfile
from pathlib import PurePosixPath

manifest = {}
with tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read()), mode='r:gz') as archive:
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or any(ord(c) < 32 for c in member.name):
            raise ValueError('Unsafe archive member path')
        if member.isdir():
            continue
        if not member.isfile():
            raise ValueError('Only ordinary files/directories are permitted')
        name = str(path)
        if name in manifest:
            raise ValueError('Duplicate archive path')
        handle = archive.extractfile(member)
        if handle is None:
            raise ValueError('Archive file is unreadable')
        manifest[name] = {'bytes': member.size, 'sha256': hashlib.file_digest(handle, 'sha256').hexdigest()}
print(json.dumps(manifest))

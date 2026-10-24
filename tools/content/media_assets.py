"""Integrity and atomic storage for content-addressed media artifacts."""
import hashlib
from pathlib import Path
import shutil
import tempfile

_verified = {}


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def file_matches(path, sha):
    path = Path(path)
    try:
        info = path.stat()
        key = (str(path), info.st_size, info.st_mtime_ns, sha)
        if key not in _verified:
            _verified[key] = file_sha256(path) == sha
        return _verified[key]
    except OSError:
        return False


def store_verified(source, target, sha):
    target = Path(target)
    if file_matches(target, sha):
        return
    if not file_matches(source, sha):
        raise ValueError('Downloaded source does not match its SHA-256 receipt')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, suffix='.tmp', delete=False) as temporary:
        path = Path(temporary.name)
    try:
        shutil.copyfile(source, path)
        if not file_matches(path, sha):
            raise ValueError('Media copy failed integrity validation')
        path.replace(target)
    finally:
        path.unlink(missing_ok=True)

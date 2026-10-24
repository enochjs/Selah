import array
import math
import shutil
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verse_clips import create_verse_files
from forced_alignment import file_sha256


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is required')
class VerseClipTests(unittest.TestCase):
    def test_files_contain_only_the_selected_verse_and_can_be_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / 'chapter.wav'
            samples = array.array('h', (
                int(16000 * math.sin(2 * math.pi * (440 if i < 24000 else 880) * i / 16000))
                for i in range(48000)
            ))
            with wave.open(str(audio), 'wb') as output:
                output.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
                output.writeframes(samples.tobytes())
            original = file_sha256(audio)
            segments = [[4, 0.2, 1.2], [5, 1.7, 2.7]]
            files = create_verse_files(audio, segments, root / 'media', root / 'cache.json')
            self.assertEqual([f['verse'] for f in files], [4, 5])
            self.assertNotEqual(files[0]['path'], files[1]['path'])
            for item, frequency in zip(files, [440, 880]):
                target = root / 'media' / item['path'].rsplit('/', 1)[1]
                self.assertEqual(file_sha256(target), item['sha256'])
                decoded = subprocess.check_output([
                    'ffmpeg', '-v', 'error', '-i', str(target), '-f', 'f32le',
                    '-ac', '1', '-ar', '16000', '-'])
                pcm = array.array('f', decoded)
                self.assertAlmostEqual(len(pcm) / 16000, 1, delta=0.01)
                for fragment in [pcm[:1600], pcm[-1600:]]:
                    def energy(hz):
                        return abs(sum(value * complex(math.cos(2 * math.pi * hz * i / 16000),
                                                       math.sin(2 * math.pi * hz * i / 16000))
                                       for i, value in enumerate(fragment)))
                    self.assertGreater(energy(frequency), energy(1320 - frequency) * 10)
            self.assertEqual(file_sha256(audio), original)
            self.assertEqual(create_verse_files(audio, segments, root / 'media', root / 'cache.json'), files)
            changed = create_verse_files(audio, [[4, 0.3, 1.2]], root / 'media', root / 'cache.json')
            self.assertNotEqual(changed[0]['sha256'], files[0]['sha256'])

    def test_rejects_overlapping_or_invalid_intervals_before_encoding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for segments in [[[1, 2, 1]], [[1, 0, 2], [2, 1, 3]], [[1, 0, float('nan')]]]:
                with self.subTest(segments=segments), self.assertRaises(ValueError):
                    create_verse_files(root / 'missing.mp3', segments, root / 'media', root / 'cache.json')

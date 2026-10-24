"""Conservative, word-preserving equivalence of English homophones."""
from functools import lru_cache
import re
import unicodedata


@lru_cache(maxsize=1)
def pronunciation_dictionary():
    import cmudict
    from importlib.metadata import version
    if version('cmudict') != '1.1.3':
        raise RuntimeError('Verification recipe requires cmudict 1.1.3')
    return cmudict.dict()


def english_words(text):
    from num2words import num2words
    text = unicodedata.normalize('NFKC', text).casefold().replace('’', "'")
    text = re.sub(r'\d[\d,]*', lambda match: num2words(match.group().replace(',', '')), text)
    words = re.findall(r"[a-z]+(?:'[a-z]+)*", text)
    # A pronunciation lookup must never silently discard an unsupported name,
    # script or numeral and then approve only the remaining words.
    if ''.join(c for c in text if c.isalnum()) != ''.join(c for w in words for c in w if c.isalnum()):
        return []
    return words


def same_english_pronunciation(reference, transcript):
    left, right = english_words(reference), english_words(transcript)
    if not left or len(left) != len(right):
        return False
    dictionary = pronunciation_dictionary()
    for expected, actual in zip(left, right):
        if expected == actual:
            continue
        expected_phones = {tuple(value) for value in dictionary.get(expected, [])}
        actual_phones = {tuple(value) for value in dictionary.get(actual, [])}
        # Complete pronunciation sets, including stress, must be identical.
        # Unknown names and ambiguous heteronyms receive no fuzzy exception.
        if not expected_phones or expected_phones != actual_phones:
            return False
    return True

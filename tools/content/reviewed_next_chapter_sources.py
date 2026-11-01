"""The imported Jeremiah closing introduction belongs to the next source file."""
from reviewed_terminal_source_fragments import (REVIEWED_TERMINAL_SOURCE_FRAGMENT_POLICY,
    fixed_terminal_fragment_inputs,derive_terminal_fragment_with_inputs,terminal_source_measurements_match)

REVIEWED_NEXT_CHAPTER_SOURCE_POLICY={**REVIEWED_TERMINAL_SOURCE_FRAGMENT_POLICY,
    'version':'registered-jeremiah-next-chapter-introduction-v1',
    'scope':'jeremiah:38:en; exact-verse28-terminal-introduction',
    'companion':'complete-introduction-in-unchanged-jeremiah39-recognition-before-verse1',
}


def next_chapter_fragment_inputs(base,receipt,materials):
    return fixed_terminal_fragment_inputs(base,receipt,materials,35,'jeremiah:38:en','jeremiah:39:en',28,
        'And Jeremiah remained in the courtyard of the guard until the day Jerusalem was captured.',
        ' This is how Jerusalem was taken:')


def derive_next_chapter_fragment_case(base,receipt,materials):
    return derive_terminal_fragment_with_inputs(base,receipt,materials,next_chapter_fragment_inputs,28)


def next_chapter_fragment_measurements_match(base,receipt,materials,pcm):
    return terminal_source_measurements_match(base,receipt,materials,pcm,next_chapter_fragment_inputs)

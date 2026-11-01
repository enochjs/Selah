"""Versioned projections of source editorial notes, preserving full reading text."""
import hashlib
import json
from spoken_text import boundary_text

# Each literal is confined to its source verse; these are editorial variants,
# not arbitrary parentheses or missing scripture.
EDITORIAL_NOTES=[
    ['luke',17,21,'心里或作中间'],['luke',17,35,'有古卷在此有'],
    ['luke',6,48,'有古卷作因为盖造得好'],
    ['luke',11,2,'有古卷只作父阿'],['luke',11,2,'有古卷无愿你的旨意云云'],
    ['luke',11,4,'有古卷无末句'],['luke',14,26,'爱我胜过爱原文作恨'],
    ['1-peter',1,22,'从心里有古卷作从清洁的心'],
    ['luke',23,38,'有古卷在此有用希利尼罗马希伯来的文字'],
]
PROJECTION_POLICY={'version':'source-editorial-projection-v1','psalmHeading':'balanced-leading-parenthesis-verse1',
                   'notes':EDITORIAL_NOTES}


def leading_parenthesis_end(text):
    if not text or text[0] not in '（(':return 0
    stack=[];closing={'）':'（',')':'('}
    for index,char in enumerate(text):
        if char in '（(':stack.append(char)
        elif char in closing:
            if not stack or stack.pop()!=closing[char]:return 0
            if not stack:return index+1
    return 0


def project_text(key,number,text):
    book,chapter,locale=key.split(':')
    if locale=='zh':
        if book=='psalms' and number==1:
            end=leading_parenthesis_end(text)
            if end:text=text[end:].strip()
        for b,c,n,note in EDITORIAL_NOTES:
            if (book,int(chapter),number)==(b,c,n):text=text.replace(note,'')
    return boundary_text(text,locale)


def projection_for(key,verses):
    return {'policy':PROJECTION_POLICY,
            'sourceTextSha256':hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),
            'texts':[{'verse':v['number'],'reference':project_text(key,v['number'],v['text'])} for v in verses]}


def projection_matches(artifact):
    try:return artifact['spokenProjection']==projection_for(artifact['key'],artifact['boundarySourceVerses'])
    except (KeyError,TypeError,ValueError):return False

"""Propose whole-chapter ASR windows using global, ordered word correspondence.

These are search proposals, never proof that a verse boundary is safe. Original
ASR clocks stay untouched; every resulting cue still needs acoustic verification.
"""
import re
from timed_text import normalized,error_rate
from numeric_alignment import cardinal


def tokens(text):
    result=[]
    for token in re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)*|[0-9]+(?:,[0-9]{3})*",text):
        parts=cardinal(int(token.replace(',','')),'and').split() if token[0].isdigit() else [token]
        result.extend(normalized(x) for x in parts)
    return result


def recognition_windows(verses,words):
    """Minimum-edit whole sequence; unlike greedy blocks, repeats retain order."""
    reference=[];offsets=[]
    for verse in verses:
        part=tokens(verse['text']);offsets.append((len(reference),len(reference)+len(part)));reference.extend(part)
    heard=[];owners=[]
    for index,word in enumerate(words):
        part=tokens(word['word']);heard.extend(part);owners.extend([index]*len(part))
    n,m=len(reference),len(heard)
    if (n+1)*(m+1)>25_000_000:raise ValueError('Chapter exceeds the bounded word correspondence matrix')
    # Two score rows and one byte per traceback cell keep chapter memory bounded.
    directions=[bytearray(m+1) for _ in range(n+1)];previous=[3*j for j in range(m+1)]
    for j in range(1,m+1):directions[0][j]=2
    for i in range(1,n+1):
        current=[3*i]+[0]*m;directions[i][0]=1;left=reference[i-1]
        for j in range(1,m+1):
            diagonal=previous[j-1]+(0 if left==heard[j-1] else 2)
            deletion=previous[j]+3;insertion=current[j-1]+3
            if diagonal<=deletion and diagonal<=insertion:current[j]=diagonal
            elif deletion<=insertion:current[j]=deletion;directions[i][j]=1
            else:current[j]=insertion;directions[i][j]=2
        previous=current
    mapping={};i,j=n,m
    while i or j:
        direction=directions[i][j]
        if direction==0:
            mapping[i-1]=(owners[j-1],reference[i-1]==heard[j-1]);i-=1;j-=1
        elif direction==1:i-=1
        else:j-=1
    result=[]
    for verse,(first,last) in zip(verses,offsets):
        positions=[mapping[i] for i in range(first,last) if i in mapping]
        value={'verse':verse['number'],'text':verse['text'],'start':None,'end':None,'recognized':'',
               'errorRate':1.0,'matchedTokens':sum(equal for _,equal in positions),'sourceTokens':last-first}
        if positions:
            start,end=positions[0][0],positions[-1][0];recognized=''.join(w['word'] for w in words[start:end+1])
            value.update(start=words[start]['start'],end=words[end]['end'],firstWord=start,lastWord=end,
                         recognized=recognized,errorRate=error_rate(''.join(reference[first:last]),normalized(recognized)))
        result.append(value)
    return result

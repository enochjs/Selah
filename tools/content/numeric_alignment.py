"""Source-preserving cardinal expansion with independently checkable word timings."""
import copy
import math
import re
from timed_text import normalized

NUMERIC_POLICY={'version':'english-cardinal-acoustic-expansion-v1','variants':['and','plain'],
                'maximumInteger':999999999999,'sourceMapping':'complete-token-span-mean-score-v1'}
_SMALL='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
_TENS='zero ten twenty thirty forty fifty sixty seventy eighty ninety'.split()


def cardinal(number,variant):
    if type(number) is not int or not 0<=number<=NUMERIC_POLICY['maximumInteger'] or variant not in NUMERIC_POLICY['variants']:
        raise ValueError('Unsupported cardinal or reading variant')
    if number<20:return _SMALL[number]
    if number<100:return _TENS[number//10]+(' '+_SMALL[number%10] if number%10 else '')
    if number<1000:return _SMALL[number//100]+' hundred'+((' and ' if variant=='and' else ' ')+cardinal(number%100,variant) if number%100 else '')
    for scale,name in [(10**9,'billion'),(10**6,'million'),(1000,'thousand')]:
        if number>=scale:
            rest=number%scale
            return cardinal(number//scale,variant)+' '+name+((' and ' if variant=='and' and rest<100 else ' ')+cardinal(rest,variant) if rest else '')
    raise ValueError('Unsupported cardinal')


def expansion(text,locale,variant):
    if locale!='en' or variant not in NUMERIC_POLICY['variants']:raise ValueError('Unsupported numeric reading')
    groups=[]
    for token in text.split():
        if not normalized(token):continue
        if re.search(r'\d[.:/]\d|\d(?:st|nd|rd|th)\b',token):raise ValueError('Non-cardinal numeral needs a separate reading rule')
        parts=re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)*|[0-9]+(?:,[0-9]{3})*",token)
        if normalized(''.join(parts))!=normalized(token):raise ValueError('Unsupported source token')
        words=[]
        for part in parts:
            words.extend(cardinal(int(part.replace(',','')),variant).split() if part[0].isdigit() else [part.replace('’',"'")])
        groups.append({'source':token,'words':words})
    return ' '.join(w for group in groups for w in group['words']),groups


def _collapse(group,words,variant):
    if [normalized(w['word']) for w in words]!=[normalized(w) for w in group['words']]:raise ValueError('Expanded alignment lost source words')
    previous=-1
    for word in words:
        start,end,score=word.get('start'),word.get('end'),word.get('score')
        if (any(not isinstance(x,(int,float)) or isinstance(x,bool) or not math.isfinite(x) for x in [start,end,score])
                or not 0<=start<end or start<previous-.02 or not 0<=score<=1):raise ValueError('Invalid expanded word evidence')
        previous=end
    result={'word':group['source'],'start':words[0]['start'],'end':words[-1]['end'],
            'score':round(sum(w['score'] for w in words)/len(words),6)}
    if re.search(r'\d',group['source']):
        result['numericExpansion']={'variant':variant,'words':copy.deepcopy(words)}
    return result


def collapse_words(words,groups,variant):
    lexical=[w for w in words if normalized(w.get('word',''))]
    result=[];cursor=0
    for group in groups:
        count=len(group['words']);part=lexical[cursor:cursor+count]
        if len(part)!=count:raise ValueError('Expanded alignment is incomplete')
        result.append(_collapse(group,part,variant));cursor+=count
    if cursor!=len(lexical):raise ValueError('Expanded alignment contains extra words')
    return result


def numeric_words_verified(words,reference):
    try:
        if normalized(''.join(w['word'] for w in words))!=normalized(reference):return False
        for word in words:
            if not re.search(r'\d',word['word']):
                if 'numericExpansion' in word:return False
                continue
            proof=word['numericExpansion'];variant=proof['variant']
            _,groups=expansion(word['word'],'en',variant)
            if len(groups)!=1 or _collapse(groups[0],proof['words'],variant)!=word:return False
        return True
    except (KeyError,TypeError,ValueError,IndexError):return False


def verified_numeric_artifact(artifact):
    try:
        from alignment_contract import BOUNDARY_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE
        from boundary_quality import verified_boundary_artifact
        base=artifact['numericBaseRecipe']
        if (artifact.get('numericAlignmentPolicy')!=NUMERIC_POLICY or not artifact['key'].endswith(':en')
                or base not in {BOUNDARY_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE}
                or not any(re.search(r'\d',v['text']) for v in artifact['boundarySourceVerses'])):return False
        for check in artifact['checks']:
            from spoken_text import boundary_text
            if not numeric_words_verified(check['alignedWords'],boundary_text(check['text'],'en')):return False
        trial={k:v for k,v in artifact.items() if k not in {'numericAlignmentPolicy','numericBaseRecipe'}}
        trial['qualityRecipe']=base
        return verified_boundary_artifact(trial)
    except (KeyError,TypeError,ValueError,IndexError):return False


def verified_numeric_files(artifact):
    try:
        verses=artifact['boundarySourceVerses'];cues=artifact['cues'];files=artifact['verseFiles']
        expected=[v['number'] for v in verses]
        if [f['verse'] for f in files]!=expected or [c['verse'] for c in cues]!=expected:return False
        for source,cue,item in zip(verses,cues,files):
            if item.get('coveredVerses',[item['verse']])!=source.get('coveredVerses',[source['number']]):return False
            start,end,duration=item['sourceStart'],item['sourceEnd'],item['duration']
            if (any(type(x) not in (int,float) or not math.isfinite(x) for x in [start,end,duration])
                    or start!=cue['start'] or end!=cue['end'] or not start<end or duration<=0
                    or abs(duration-(end-start))>.002
                    or not re.fullmatch('[a-f0-9]{64}',item['sha256'])
                    or item['path']!='/api/audio/resources/'+item['sha256']+'.mp3'):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError):return False

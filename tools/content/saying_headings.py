"""Read the NIV's numbered Saying headings without changing imported verse text."""
import re
from source_omissions import (_NivBodyParser,_EXCLUDED_CLASSES,_EXCLUDED_PREFIXES,
                              validate_niv_evidence)

_EXPECTED={22:list(range(1,7)),23:list(range(7,20)),24:list(range(20,31))}


def _hidden(tag,attributes):
    classes=set(attributes.get('class','').split())
    return (tag in {'script','style','sup','noscript','template'} or 'hidden' in attributes
        or attributes.get('aria-hidden')=='true'
        or bool(re.search(r'display\s*:\s*none|visibility\s*:\s*hidden',attributes.get('style',''),re.I))
        or bool(classes&_EXCLUDED_CLASSES)
        or any(token.startswith(_EXCLUDED_PREFIXES) for token in classes|{attributes.get('id','')}))


class _SayingParser(_NivBodyParser):
    def __init__(self,chapter):
        super().__init__('Prov',chapter)
        self.heading=None
        self.headings={}
        self.heading_order=[]

    def handle_starttag(self,tag,attributes):
        attributes=dict(attributes);parent=self.stack[-1] if self.stack else {}
        starts=(self.heading is None and tag in {'h3','h4'} and parent.get('niv')
            and parent.get('body') and not parent.get('excluded') and not _hidden(tag,attributes))
        depth=len(self.stack)
        super().handle_starttag(tag,list(attributes.items()))
        if len(self.stack)>depth:self.stack[-1]['sayingHidden']=_hidden(tag,attributes)
        if starts:self.heading=dict(depth=len(self.stack),refs=set(),text=[])
        if self.heading is None or any(f.get('sayingHidden') for f in self.stack[self.heading['depth']-1:]):return
        for token in attributes.get('class','').split():
            match=re.fullmatch(r'Prov-([1-9][0-9]*)-([1-9][0-9]*)',token)
            if match:
                chapter,verse=map(int,match.groups())
                if chapter!=self.chapter:raise ValueError('A Saying heading belongs to another chapter')
                self.heading['refs'].add(verse)

    def handle_data(self,data):
        if self.heading is not None and not any(f.get('sayingHidden') for f in self.stack[self.heading['depth']-1:]):
            self.heading['text'].append(data)
        super().handle_data(data)

    def handle_endtag(self,tag):
        index=next((i for i in range(len(self.stack)-1,-1,-1) if self.stack[i]['tag']==tag),None)
        if self.heading is not None and index==self.heading['depth']-1:
            title=' '.join(''.join(self.heading['text']).split());match=re.fullmatch(r'Saying ([1-9][0-9]*)',title)
            if match:
                number=int(match[1])
                if number in self.headings or len(self.heading['refs'])!=1:raise ValueError('Duplicate or unbound Saying heading')
                self.headings[number]=next(iter(self.heading['refs']));self.heading_order.append(number)
            self.heading=None
        super().handle_endtag(tag)


def extract_saying_headings(evidence,key,canonical):
    if key not in {'proverbs:22:en','proverbs:23:en','proverbs:24:en'} or not validate_niv_evidence(evidence,key,canonical):
        raise ValueError('Need the complete same-edition original Proverbs heading reference')
    chapter=int(key.split(':')[1]);parser=_SayingParser(chapter);parser.feed(evidence['rawHtml']);parser.result([v['number'] for v in canonical])
    if (parser.heading_order!=_EXPECTED[chapter] or list(parser.headings.values())!=sorted(set(parser.headings.values()))
        or any(v not in {x['number'] for x in canonical} for v in parser.headings.values())):
        raise ValueError('The complete ordered NIV Saying heading inventory is missing or ambiguous')
    return parser.headings

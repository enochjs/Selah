import copy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class MonotonicWindowTests(unittest.TestCase):
    def test_repeated_offerings_keep_their_order_when_names_are_misrecognized(self):
        import monotonic_windows
        verses=[];spoken=[]
        for i,(source,heard) in enumerate([('Nahshon','Naushan'),('Nethanel','Nathaniel'),('Eliab','Eliab')]):
            verses.extend([{'number':3*i+1,'text':'On the next day '+source+' brought his offering.'},
                {'number':3*i+2,'text':'one male goat for a sin offering;'},
                {'number':3*i+3,'text':'This was the offering of '+source+'.'}])
            spoken.extend(('On the next day '+heard+' brought his offering one male goat for a sin offering This was the offering of '+heard).split())
        words=[{'word':w,'start':i,'end':i+.8} for i,w in enumerate(['Chapter','seven',*spoken])]
        before=copy.deepcopy(words);windows=monotonic_windows.recognition_windows(verses,words)
        self.assertEqual([w['verse'] for w in windows],list(range(1,10)))
        for i,w in enumerate(windows):
            self.assertIsNotNone(w['start'])
            if i:self.assertLess(windows[i-1]['lastWord'],w['firstWord'])
        self.assertEqual([windows[i]['start'] for i in [1,4,7]],[10,31,52])
        self.assertEqual(words,before)

    def test_numeric_tokens_can_locate_spoken_cardinals_without_changing_evidence(self):
        import monotonic_windows
        verses=[{'number':1,'text':'The plate weighed one hundred and thirty shekels.'},
                {'number':2,'text':'Then came the second offering.'}]
        words=[{'word':w,'start':i,'end':i+.8} for i,w in enumerate('The plate weighed 130 shekels Then came the second offering'.split())]
        windows=monotonic_windows.recognition_windows(verses,words)
        self.assertEqual([(w['firstWord'],w['lastWord']) for w in windows],[(0,4),(5,9)])

    def test_empty_recognition_does_not_create_a_timestamp(self):
        import monotonic_windows
        window=monotonic_windows.recognition_windows([{'number':1,'text':'God is good.'}],[])[0]
        self.assertIsNone(window['start']);self.assertIsNone(window['end'])

if __name__=='__main__':unittest.main()

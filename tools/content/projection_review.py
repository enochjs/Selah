"""Re-align explicitly versioned spoken text without changing source scripture."""
import json
from boundary_review import BoundaryAligner
from spoken_projection import project_text,projection_for
from align_site import matching_text
from alignment_contract import PROJECTION_REVIEW_RECIPE
from site_resources import write_json


class ProjectionBoundaryAligner(BoundaryAligner):
    def __init__(self,locale,snapshot):
        super().__init__(locale,snapshot)
        self.recipe=PROJECTION_REVIEW_RECIPE
        self.current_key='';self.verse_numbers={}
        self.normalize=lambda text:matching_text(self.project(text),locale)

    def project(self,text):
        if text in self.verse_numbers:return project_text(self.current_key,self.verse_numbers[text],text)
        from spoken_text import boundary_text
        return boundary_text(text,self.locale)

    def verify_range(self,audio,window,start,end,initial=None):
        from whisperx.alignment import align
        reference=project_text(self.current_key,window['verse'],window['text'])
        aligned=align([{'start':start,'end':end,'text':reference}],self.model,self.metadata,audio,self.device,
                      interpolate_method='ignore',return_char_alignments=False)
        words=[w for segment in aligned['segments'] for w in segment['words']]
        cue,check=self.assess_words(audio,{**window,'text':reference},words,start,end,initial=initial)
        check.update(text=window['text'],spokenText=reference)
        if cue:cue['text']=window['text']
        return cue,check

    def publication_evidence(self,verses):
        return {**super().publication_evidence(verses),'spokenProjection':projection_for(self.current_key,verses)}

    def align_recording(self,receipt,verses,**options):
        self.current_key=receipt['key'];self.verse_numbers={v['text']:v['number'] for v in verses}
        name=receipt['key'].replace(':','__')+'.json';path=self.snapshot/'alignment'/name
        backup=self.snapshot/'alignment-before-spoken-projection'/name
        if path.exists() and not backup.exists():write_json(backup,json.loads(path.read_text()))
        return super().align_recording(receipt,verses,**options)

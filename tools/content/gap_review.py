"""Remote gap acoustic review and lightweight, ML-free publication measurements."""
from array import array
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from align_site import ROOT, SiteAligner
from alignment_contract import GAP_REVIEW_RECIPE, BOUNDARY_RECOGNIZER, RECOGNIZERS, site_fingerprint
from boundary_quality import verified_boundary_artifact
from media_assets import file_matches
from publish_site import recording_entry
from quiet_gaps import GAP_POLICY, measure_gaps, measurements_match, verified_quiet_gaps
from site_resources import write_json

_media_verified={}


def decode_pcm(path):
    data=subprocess.run(['ffmpeg','-nostdin','-loglevel','error','-threads','1','-i',str(path),
                         '-f','s16le','-ac','1','-acodec','pcm_s16le','-ar','16000','-'],
                        stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
    pcm=array('h');pcm.frombytes(data)
    if sys.byteorder!='little':pcm.byteswap()
    return pcm


def verify_gap_media(artifact,path):
    """Recompute all stored RMS frames from the hash-verified original; no VAD/ML."""
    path=Path(path);info=path.stat()
    if not file_matches(path,artifact['sourceAudioSha256']):return False
    key=(str(path),info.st_size,info.st_mtime_ns,artifact['acousticGapReview']['id'])
    if key not in _media_verified:
        _media_verified[key]=measurements_match(artifact,decode_pcm(path))
    return _media_verified[key]


class AcousticGapReviewer(SiteAligner):
    def __init__(self,locale,snapshot):
        self.locale,self.snapshot=locale,snapshot
        self.recipe=GAP_REVIEW_RECIPE
        self.recognizer_name=BOUNDARY_RECOGNIZER
        self.recognizer_revision=RECOGNIZERS[BOUNDARY_RECOGNIZER]

    def align_recording(self,receipt,verses,**unused):
        import numpy as np
        from faster_whisper import vad
        path=self.snapshot/'alignment'/(receipt['key'].replace(':','__')+'.json')
        original=json.loads(path.read_text())
        text_sha=hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        if recording_entry(receipt,original,text_sha)['alignmentStatus']!='review-required':
            raise ValueError('Gap review requires a source-matched rejected report')
        boundary_trial={**original,'accepted':True,'issues':[],'unclaimedSpeech':[]}
        if not verified_boundary_artifact(boundary_trial):
            raise ValueError('Quiet gap proof cannot repair unreliable verse edges')
        source=ROOT/'storage/resources/media'/(receipt['sha256']+'.mp3')
        if not file_matches(source,receipt['sha256']):raise ValueError('Original recording SHA differs')
        model=Path(vad.__file__).parent/'assets/silero_vad_v6.onnx'
        if not file_matches(model,GAP_POLICY['vadModelSha256']):raise ValueError('Unexpected VAD model')
        pcm=decode_pcm(source)
        audio=np.asarray(pcm,dtype=np.float32)/32768
        options=vad.VadOptions(threshold=GAP_POLICY['vadThreshold'],neg_threshold=GAP_POLICY['vadNegativeThreshold'],min_speech_duration_ms=GAP_POLICY['vadMinimumSpeechMs'],
            min_silence_duration_ms=GAP_POLICY['vadMinimumSilenceMs'],speech_pad_ms=GAP_POLICY['vadPaddingMs'])
        speech=[[v['start'],v['end']] for v in vad.get_speech_timestamps(audio,vad_options=options)]
        result=copy.deepcopy(original)
        result['acousticGapReview']=measure_gaps(result,pcm,speech)
        passed=verified_quiet_gaps(result)
        result.update(qualityRecipe=self.recipe,accepted=passed,issues=[] if passed else original['issues'],
            fingerprint=site_fingerprint(receipt['sha256'],text_sha,self.locale,self.recipe,self.recognizer_name),
            gapReview={'recipe':self.recipe,'sourceFingerprint':original['fingerprint']})
        if passed and not verified_boundary_artifact(result):raise ValueError('Final acoustic gap proof failed')
        backup=self.snapshot/'alignment-before-acoustic-gap-review'/path.name
        if not backup.exists():write_json(backup,original)
        self.materialize(result,receipt,verses,source)
        write_json(path,result)
        return result

"""Registered source-window recovery with the original numeric proof retained.

The internal model witness is used only after every original numeric expansion
has been verified. The published report embeds the unchanged numeric artifact.
"""
import copy
import re
from numeric_alignment import NUMERIC_POLICY,numeric_words_verified
from reviewed_source_windows import REVIEWED_WINDOW_POLICY,derive_source_window_case
from spoken_text import boundary_text
from user_source_seams import USER_PRESERVED_SEAM_POLICY

REVIEWED_NUMERIC_SOURCE_POLICY={
    'version':'registered-numeric-source-window-recovery-v1',
    'numericPolicy':NUMERIC_POLICY,'sourcePolicy':REVIEWED_WINDOW_POLICY,
    'base':'original-rejected-numeric-artifact-with-raw-or-joint-padding-model-base',
    'numericProof':'every-canonical-token-and-every-expanded-child-clock-and-score-reverified-before-model-witness',
    'numericChildProtection':'each-original-expanded-child-must-fit-final-verse-and-every-changed-source-protection-range',
    'originalFacts':'unchanged-numeric-base-policy-expansions-checks-and-original-fingerprint-embedded',
    'sourceProof':'exact-registered-source-cuts-and-complete-original-output-inventory',
    'clockExceptions':False,
}
REVIEWED_NUMERIC_USER_POLICY={**REVIEWED_NUMERIC_SOURCE_POLICY,
    'version':'registered-numeric-user-natural-source-seam-v1',
    'sourcePolicy':USER_PRESERVED_SEAM_POLICY,
    'seam':'one-exact-user-accepted-shared-seam-with-all-numeric-child-and-model-word-clocks-retained',
}


def derive_numeric_source_case(base,receipt,materials):
    from alignment_contract import NUMERIC_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    model_recipe=base['numericBaseRecipe']
    human=receipt['schemaVersion'] in {17,22}
    if (receipt['schemaVersion'] not in {9,17,21,22} or base['qualityRecipe']!=NUMERIC_REVIEW_RECIPE
        or model_recipe not in {BOUNDARY_REVIEW_RECIPE,PADDING_REVIEW_RECIPE}
        or base['numericAlignmentPolicy']!=NUMERIC_POLICY or not base['key'].endswith(':en')
        or not any(re.search(r'\d',v['text']) for v in base['boundarySourceVerses'])
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',NUMERIC_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
        or any(not numeric_words_verified(c['alignedWords'],boundary_text(c['text'],'en')) for c in base['checks'])):
        raise ValueError('Need the complete unchanged original numeric expansion proof')
    witness=copy.deepcopy(base)
    for field in ['numericAlignmentPolicy','numericBaseRecipe']:witness.pop(field)
    witness.update(qualityRecipe=model_recipe,fingerprint=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',model_recipe,BOUNDARY_RECOGNIZER))
    background_owners=None
    if receipt['schemaVersion']==21:
        from reviewed_background_sources import background_gap_owners
        background_owners=background_gap_owners(base,receipt,materials)
    source_receipt={**receipt,'schemaVersion':22 if receipt['schemaVersion']==22 else 21 if background_owners is not None else 8 if human else 4}
    result=derive_source_window_case(witness,source_receipt,materials,background_owners=background_owners)
    final={c['verse']:c for c in receipt['finalCues']}
    for check in base['checks']:
        verse=check['verse'];cue=final[verse]
        ranges=[[cue['start'],cue['end']],*[c['protectedCore' if human else 'ownVoice'] for c in receipt['cuts'] if c['verse']==verse]]
        for word in check['alignedWords']:
            for child in word.get('numericExpansion',{}).get('words',[]):
                if any(not lo<=child['start']<child['end']<=hi for lo,hi in ranges):
                    raise ValueError('Source cut loses an original expanded numeric child')
    result.update(numericAlignmentPolicy=copy.deepcopy(base['numericAlignmentPolicy']),numericBaseRecipe=model_recipe,
                  qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'])
    return result

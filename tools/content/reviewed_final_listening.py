"""Exact final source listening decisions, distinct from quiet acoustic proofs."""

def validate_final_listening(base,receipt):
    schema=receipt['schemaVersion'];expected={41:('nehemiah:7:en','自然完整，可以采用'),42:('proverbs:23:en','完整且不串入标题，可以采用'),43:('psalms:136:en','分界自然、末节完整，之后只有背景声')}
    if (schema not in expected or base['key']!=expected[schema][0] or receipt.get('humanDecision')!=expected[schema][1]
        or receipt.get('sourceAcousticApproval') is not False):raise ValueError('Need the exact source listening decision for this chapter')
    if schema==41 and receipt['naturalSeam']!=dict(leftVerse=33,rightVerse=34,cut=160.48,uncertainty=[160.46,160.50]):raise ValueError('The accepted Nehemiah seam changed')
    if schema==42 and receipt['headingListening']!=dict(number=9,afterVerse=5,beforeVerse=6,leftEnd=31.55,rightStart=33.70):raise ValueError('The accepted Saying nine source range changed')
    if schema==43 and (receipt['naturalSeam']!=dict(leftVerse=11,rightVerse=12,cut=55.93,uncertainty=[55.91,55.95]) or receipt['humanEnding']!=dict(verse=26,cut=131.20)):raise ValueError('The accepted Psalm seam or ending changed')

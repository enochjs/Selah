"""Pure source reading-note normalization, shared by alignment and publication."""
import re


def boundary_text(text, locale):
    text = spoken_text(text, locale)
    if locale == 'zh':
        # This source splits some variant-note introductions across verse IDs.
        # The literal editorial introduction is not the spoken verse ending.
        text = re.sub(r'[（(]有古卷在此有[，,\s]*$', '', text).strip()
    return text


def spoken_text(text, locale):
    # Source typography/translation notes remain in the published reading text.
    if locale == 'zh':
        # Psalm superscriptions are metadata, unlike spoken explanations
        # inside a verse. Keep them in reading text and account for any
        # narrated superscription separately as a chapter heading.
        text = re.sub(r'^（[^（）]*(?:的诗|的金诗|的训诲|的祈祷|的默想|流离歌|上行(?:之)?诗|交与伶长)[^（）]*）', '', text)
        # The WordProject reader speaks explanatory parentheses, including
        # names and their meanings. Only editorial variant/cross-reference
        # notes are omitted; dropping every parenthesis loses real speech.
        editorial = (r'原文|或作|或译|有古卷|下同|节同|此句乃照[^（）()]*所加'
                     r'|[零〇一二三四五六七八九十百\d]+章[零〇一二三四五六七八九十百\d]+节作')
        # Five literal editorial glosses independently found absent in the original
        # recording. Match their source context, never arbitrary names/meanings
        # or genuine parenthetical scripture. Reading text remains unchanged.
        for prefix, note in [('亚比央', '又名亚比雅'), ('濠沟', '海指尼罗河'),
                             ('拿八', '就是愚顽的意思'), ('女子的声音', '女子就是指民的意思'),
                             ('挪的亚扪', '埃及尊大之神')]:
            text = text.replace(prefix + '（' + note + '）', prefix)
            text = text.replace(prefix + '(' + note + ')', prefix)
        return re.sub(r'（[^（）]*(?:' + editorial + r')[^（）]*）'
                      r'|\([^()]*(?:' + editorial + r')[^()]*\)'
                      r'|（(?:又作吕彼亚人|有作四年的|又作以色列人|有作以东人的)）'
                      r'|\((?:又作吕彼亚人|有作四年的|又作以色列人|有作以东人的)\)'
                      r'|（就是要赞美耶和华的意思）|\(就是要赞美耶和华的意思\)', '', text).strip()
    # The site occasionally joins sentences without a space ("valley,I").
    return re.sub(r'([,;:!?])(?=[A-Za-z])', r'\1 ', text).strip()



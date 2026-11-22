package app.selah.reading

import android.icu.text.BreakIterator
import android.icu.util.ULocale
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WordSegmentationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SelahWordSegmentation")

    Function("segment") { text: String, language: String ->
      val breaks = BreakIterator.getWordInstance(ULocale.forLanguageTag(language))
      breaks.setText(text)
      buildList {
        var start = breaks.first()
        var end = breaks.next()
        while (end != BreakIterator.DONE) {
          add(text.substring(start, end))
          start = end
          end = breaks.next()
        }
      }
    }
  }
}

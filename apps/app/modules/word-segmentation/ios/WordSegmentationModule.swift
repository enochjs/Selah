import ExpoModulesCore
import NaturalLanguage

public final class WordSegmentationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SelahWordSegmentation")

    Function("segment") { (text: String, language: String) -> [String] in
      let tokenizer = NLTokenizer(unit: .word)
      tokenizer.string = text
      tokenizer.setLanguage(language == "zh" ? .simplifiedChinese : NLLanguage(rawValue: language))

      var segments: [String] = []
      var start = text.startIndex
      tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
        if start < range.lowerBound {
          segments.append(String(text[start..<range.lowerBound]))
        }
        segments.append(String(text[range]))
        start = range.upperBound
        return true
      }
      if start < text.endIndex {
        segments.append(String(text[start...]))
      }
      return segments
    }
  }
}

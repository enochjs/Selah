import Foundation

// Receipt identity wins over the embedded build marker. Development/ad hoc
// distributions may have no receipt, so only a compiled Info.plist fallback is used.
func installedUpdateChannel(receiptName: String?, marker: String?) -> String {
  if receiptName == "sandboxReceipt" { return "testflight" }
  if receiptName == "receipt" { return "store" }
  return marker == "testflight" ? "testflight" : "store"
}

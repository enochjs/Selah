import Foundation
@main struct ChannelTests {
  static func main() {
    precondition(installedUpdateChannel(receiptName: "sandboxReceipt", marker: nil) == "testflight")
    precondition(installedUpdateChannel(receiptName: "receipt", marker: "testflight") == "store")
    precondition(installedUpdateChannel(receiptName: "sandboxReceipt", marker: "store") == "testflight")
    precondition(installedUpdateChannel(receiptName: nil, marker: "testflight") == "testflight")
    precondition(installedUpdateChannel(receiptName: nil, marker: "store") == "store")
    precondition(installedUpdateChannel(receiptName: nil, marker: "untrusted") == "store")
    precondition(installedUpdateChannel(receiptName: nil, marker: nil) == "store")
    print("7 installed-channel assertions passed")
  }
}

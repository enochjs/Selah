import ExpoModulesCore
public class AppUpdatesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SelahAppUpdates")
    Function("installed") {
      let info = Bundle.main.infoDictionary ?? [:]
      let receipt = Bundle.main.appStoreReceiptURL
      let receiptName = receipt.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0.lastPathComponent : nil }
      let channel = installedUpdateChannel(receiptName: receiptName, marker: info["SelahUpdateChannel"] as? String)
      return ["platform": "ios", "channel": channel, "appId": Bundle.main.bundleIdentifier ?? "", "version": info["CFBundleShortVersionString"] as? String ?? "", "buildNumber": Int(info["CFBundleVersion"] as? String ?? "0") ?? 0] as [String: Any]
    }
  }
}

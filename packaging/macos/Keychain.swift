import Foundation
import Security

private let service = "Brightspace Context Vault"

private func fail() -> Never {
    FileHandle.standardError.write(Data("Brightspace Context Keychain access failed.\n".utf8))
    exit(1)
}

private func query(for reference: Data) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: reference.base64EncodedString()]
}

private func explicitKeychain() -> SecKeychain? {
    guard let path = ProcessInfo.processInfo.environment["BRIGHTSPACE_KEYCHAIN_PATH"] else { return nil }
    var result: SecKeychain?
    guard path.hasPrefix("/"), path.withCString({ SecKeychainOpen($0, &result) }) == errSecSuccess,
          let result else { fail() }
    return result
}

// Use the macOS login keychain's default ACL for the creating executable.
// Both the companion and MCP invoke this same helper to access the item.
let allowPrompt = ProcessInfo.processInfo.environment["BRIGHTSPACE_KEYCHAIN_INTERACTIVE"] == "1"
guard SecKeychainSetUserInteractionAllowed(allowPrompt) == errSecSuccess,
      let message = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) else { fail() }
let fields = message.split(separator: "\n", maxSplits: 1)
guard fields.count == 2, let input = Data(base64Encoded: String(fields[1])) else { fail() }
let keychain = explicitKeychain()

let output: Data
switch fields[0] {
case "protect":
    guard input.count == 32 else { fail() }
    var reference = Data(count: 24)
    let randomStatus = reference.withUnsafeMutableBytes { (buffer: UnsafeMutableRawBufferPointer) in
        SecRandomCopyBytes(kSecRandomDefault, buffer.count, buffer.baseAddress!)
    }
    guard randomStatus == errSecSuccess else { fail() }
    var item = query(for: reference)
    item[kSecValueData as String] = input
    item[kSecAttrLabel as String] = service
    if let keychain { item[kSecUseKeychain as String] = keychain }
    guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { fail() }
    output = reference
case "unprotect":
    guard input.count == 24 else { fail() }
    var match = query(for: input)
    match[kSecReturnData as String] = true
    match[kSecMatchLimit as String] = kSecMatchLimitOne
    if let keychain { match[kSecMatchSearchList as String] = [keychain] }
    var result: CFTypeRef?
    guard SecItemCopyMatching(match as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data, data.count == 32 else { fail() }
    output = data
default:
    fail()
}

FileHandle.standardOutput.write(Data(output.base64EncodedString().utf8))

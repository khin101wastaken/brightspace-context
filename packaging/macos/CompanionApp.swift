import AppKit
import Darwin
import Security

@main
struct BrightspaceContext {
    @MainActor static func main() {
        let application = NSApplication.shared
        let launcher = CompanionApp()
        application.delegate = launcher
        application.setActivationPolicy(.accessory)
        withExtendedLifetime(launcher) { application.run() }
    }
}

@MainActor
private final class CompanionApp: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let statusLine = NSMenuItem(title: "Starting companion…", action: nil, keyEquivalent: "")
    private let dashboard = NSMenuItem(title: "Open dashboard", action: #selector(openDashboard), keyEquivalent: "")
    private let pairing = NSMenuItem(title: "Show pairing code", action: #selector(showPairing), keyEquivalent: "")
    private let restart = NSMenuItem(title: "Start companion", action: #selector(retryStart), keyEquivalent: "")
    private let notice = PairingPanel()
    private var child: Process?
    private var input: Pipe?
    private var output: Pipe?
    private var outputBuffer = Data()
    private var token: String?
    private var address: URL?
    private var code: String?
    private var ready = false
    private var quitting = false
    private var startupError: String?
    private var startupDeadline: DispatchWorkItem?
    private var openWhenReady = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        if Bundle.main.bundleURL.pathComponents.contains("AppTranslocation") || Bundle.main.bundleURL.path.hasPrefix("/Volumes/") {
            let alert = NSAlert()
            alert.messageText = "Move Brightspace Context to Applications"
            alert.informativeText = "Drag the app to Applications, then open that copy. Codex uses the app’s installed location."
            alert.addButton(withTitle: "Quit")
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
            NSApp.terminate(nil)
            return
        }
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        statusLine.isEnabled = false
        menu.addItem(statusLine)
        menu.addItem(.separator())
        for item in [dashboard, pairing, restart] {
            item.target = self
            menu.addItem(item)
        }
        let guide = NSMenuItem(title: "Setup guide", action: #selector(openGuide), keyEquivalent: "")
        guide.target = self
        menu.addItem(guide)
        menu.addItem(.separator())
        let version = Bundle.main.object(forInfoDictionaryKey: "BrightspaceVersion") as? String ?? ""
        let versionItem = NSMenuItem(title: "Version \(version)", action: nil, keyEquivalent: "")
        versionItem.isEnabled = false
        menu.addItem(versionItem)
        let quit = NSMenuItem(title: "Quit Brightspace Context", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.target = NSApp
        menu.addItem(quit)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "doc.text", accessibilityDescription: "Brightspace Context")
            button.image?.isTemplate = true
            button.toolTip = "Brightspace Context"
            button.setAccessibilityLabel("Brightspace Context")
        }
        statusItem.menu = menu
        NotificationCenter.default.addObserver(self, selector: #selector(screenChanged(_:)),
                                               name: NSApplication.didChangeScreenParametersNotification, object: nil)
        startCompanion()
    }

    @objc private func retryStart() { startCompanion(allowKeychainPrompt: true) }

    private func startCompanion(allowKeychainPrompt: Bool = false) {
        guard child == nil, !quitting else { return }
        statusLine.title = "Starting companion…"
        dashboard.isEnabled = false
        pairing.isEnabled = false
        restart.isHidden = true
        startupError = nil
        ready = false
        address = nil
        code = nil
        outputBuffer.removeAll()

        var bytes = [UInt8](repeating: 0, count: 32)
        let randomStatus = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, buffer.count, buffer.baseAddress!)
        }
        guard randomStatus == errSecSuccess, let resources = Bundle.main.resourceURL,
              let executable = Bundle.main.url(forAuxiliaryExecutable: "node") else {
            showStopped("Companion files unavailable")
            return
        }
        let secret = bytes.map { String(format: "%02x", $0) }.joined()
        let app = resources.appendingPathComponent("app", isDirectory: true)
        let process = Process()
        let stdin = Pipe(), pipe = Pipe()
        process.executableURL = executable
        process.arguments = [app.appendingPathComponent("companion/start.js").path, "--tray"]
        process.currentDirectoryURL = app
        var environment = ProcessInfo.processInfo.environment
        environment["BRIGHTSPACE_MANAGEMENT_TOKEN"] = secret
        environment["BRIGHTSPACE_KEYCHAIN_INTERACTIVE"] = allowKeychainPrompt ? "1" : "0"
        process.environment = environment
        process.standardInput = stdin
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async { [weak self] in self?.receive(data, from: process) }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async { [weak self] in self?.didExit(process) }
        }
        do {
            child = process
            input = stdin
            output = pipe
            token = secret
            try process.run()
        } catch {
            didExit(process, launchFailed: true)
            return
        }
        let deadline = DispatchWorkItem { [weak self, weak process] in
            guard let self, let process, self.child === process, !self.ready else { return }
            self.startupError = "Companion startup timed out"
            self.stopChild(process)
        }
        startupDeadline = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + (allowKeychainPrompt ? 120 : 45), execute: deadline)
    }

    private func receive(_ data: Data, from process: Process) {
        guard child === process, !quitting else { return }
        outputBuffer.append(data)
        while let end = outputBuffer.firstIndex(of: 10) {
            let line = String(decoding: outputBuffer[..<end], as: UTF8.self)
            outputBuffer.removeSubrange(...end)
            if line.hasPrefix("Address: ") {
                let value = String(line.dropFirst("Address: ".count))
                if let url = URLComponents(string: value), url.scheme == "http", url.host == "127.0.0.1",
                   let port = url.port, (1...65535).contains(port), url.user == nil, url.password == nil,
                   url.path.isEmpty, url.query == nil, url.fragment == nil { address = url.url }
            } else if line.hasPrefix("Pairing code: ") {
                let value = String(line.dropFirst("Pairing code: ".count))
                if value.range(of: "^[a-f0-9]{10}$", options: .regularExpression) != nil { code = value }
            } else if line.hasPrefix("Protected storage could not") {
                startupError = "Keychain or cache unavailable"
            } else if line.hasPrefix("Another companion is already") {
                startupError = "Another companion is running"
            }
        }
        if outputBuffer.count > 65_536 { outputBuffer.removeAll() }
        guard !ready, address != nil, let code else { return }
        ready = true
        startupDeadline?.cancel()
        statusLine.title = "Companion running"
        dashboard.isEnabled = true
        pairing.isEnabled = true
        notice.present(code: code, below: statusItem.button, keyboard: false)
        if openWhenReady { openDashboard() }
    }

    private func showStopped(_ message: String) {
        statusLine.title = message
        dashboard.isEnabled = false
        pairing.isEnabled = false
        restart.isHidden = false
    }

    private func didExit(_ process: Process, launchFailed: Bool = false) {
        guard child === process else { return }
        // The final pipe event can arrive after the exit callback. The menu remains usable either way.
        output?.fileHandleForReading.readabilityHandler = nil
        try? input?.fileHandleForWriting.close()
        input = nil
        output = nil
        child = nil
        token = nil
        address = nil
        code = nil
        startupDeadline?.cancel()
        notice.dismissPanel()
        if quitting { NSApp.reply(toApplicationShouldTerminate: true); return }
        showStopped(startupError ?? (launchFailed || !ready ? "Companion could not start" : "Companion stopped"))
        ready = false
    }

    private func stopChild(_ process: Process) {
        try? input?.fileHandleForWriting.close()
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self, weak process] in
            guard let self, let process, self.child === process, process.isRunning else { return }
            process.terminate()
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self, weak process] in
                guard let self, let process, self.child === process, process.isRunning else { return }
                kill(process.processIdentifier, SIGKILL)
            }
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let process = child else { return .terminateNow }
        quitting = true
        startupDeadline?.cancel()
        notice.dismissPanel()
        stopChild(process)
        return .terminateLater
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if ready { openDashboard() }
        else { openWhenReady = true; startCompanion() }
        return false
    }

    func menuWillOpen(_ menu: NSMenu) {
        guard ready, let address, let token else { return }
        let url = address.appendingPathComponent("manage/api/status")
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 2)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let response = response as? HTTPURLResponse, response.statusCode == 200, let data,
                  let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let connected = value["connected"] as? Bool else { return }
            DispatchQueue.main.async { [weak self] in
                guard let self, self.ready, self.token == token else { return }
                self.statusLine.title = connected ? "Browser connected" : "Companion running"
            }
        }.resume()
    }

    @objc private func screenChanged(_ notification: Notification) { if notice.isVisible { notice.placeNearMenuBar() } }

    @objc private func showPairing() {
        if let code { notice.present(code: code, below: statusItem.button, keyboard: true) }
    }

    @objc private func openDashboard() {
        guard let address, let token, let url = URL(string: address.absoluteString + "/manage/#" + token) else { return }
        openWhenReady = false
        NSWorkspace.shared.open(url)
    }

    @objc private func openGuide() {
        if let guide = Bundle.main.url(forResource: "SETUP", withExtension: "html") { NSWorkspace.shared.open(guide) }
    }
}

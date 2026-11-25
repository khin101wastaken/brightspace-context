import AppKit

private final class PanelSurface: NSView {
    override func draw(_ dirtyRect: NSRect) {
        let shape = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 14, yRadius: 14)
        NSColor.windowBackgroundColor.setFill()
        shape.fill()
        NSColor.separatorColor.setStroke()
        shape.stroke()
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        needsDisplay = true
    }
}

@MainActor
final class PairingPanel: NSPanel {
    private let codeLabel = NSTextField(labelWithString: "")
    private let copyButton = NSButton(title: "Copy code", target: nil, action: nil)
    private var code = ""
    private var timer: Timer?
    private var lastInteraction = 0.0
    private weak var anchor: NSStatusBarButton?

    override var canBecomeKey: Bool { true }

    init() {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 310, height: 164),
                   styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        title = "Brightspace Context pairing code"
        isReleasedWhenClosed = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        hidesOnDeactivate = false
        level = .popUpMenu
        collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary, .transient]

        let surface = PanelSurface()
        contentView = surface
        let heading = NSTextField(labelWithString: "Pair Chrome")
        heading.font = .systemFont(ofSize: 13, weight: .semibold)
        codeLabel.font = .monospacedSystemFont(ofSize: 25, weight: .semibold)
        let detail = NSTextField(labelWithString: "Enter this code in the Chrome extension.")
        detail.textColor = .secondaryLabelColor

        copyButton.target = self
        copyButton.action = #selector(copyCode)
        copyButton.bezelStyle = .rounded
        copyButton.keyEquivalent = "\r"
        let dismiss = NSButton(title: "Dismiss", target: self, action: #selector(dismissPanel))
        dismiss.bezelStyle = .rounded
        dismiss.keyEquivalent = "\u{1b}"
        let buttons = NSStackView(views: [copyButton, dismiss])
        buttons.spacing = 8
        let stack = NSStackView(views: [heading, codeLabel, detail, buttons])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 7
        stack.setCustomSpacing(12, after: detail)
        stack.translatesAutoresizingMaskIntoConstraints = false
        surface.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: surface.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: surface.trailingAnchor, constant: -18),
            stack.centerYAnchor.constraint(equalTo: surface.centerYAnchor),
        ])
        initialFirstResponder = copyButton
    }

    func present(code: String, below anchor: NSStatusBarButton?, keyboard: Bool) {
        self.anchor = anchor
        self.code = code
        codeLabel.stringValue = code
        codeLabel.setAccessibilityLabel("Pairing code, \(code)")
        copyButton.title = "Copy code"
        lastInteraction = ProcessInfo.processInfo.systemUptime
        alphaValue = 1
        placeNearMenuBar()
        if keyboard {
            makeKeyAndOrderFront(nil)
            makeFirstResponder(copyButton)
        } else {
            orderFrontRegardless()
        }
        timer?.invalidate()
        let animationTimer = Timer(timeInterval: 1.0 / 24.0, target: self,
                                   selector: #selector(tick), userInfo: nil, repeats: true)
        timer = animationTimer
        RunLoop.main.add(animationTimer, forMode: .common)
    }

    func placeNearMenuBar() {
        let barWindow = anchor?.window
        guard let screen = barWindow?.screen ?? NSScreen.main else { return }
        let safe = screen.visibleFrame
        let barFrame = anchor.flatMap { status in
            barWindow?.isVisible == true ? barWindow?.convertToScreen(status.convert(status.bounds, to: nil)) : nil
        }
        let center = barFrame?.midX ?? (safe.maxX - frame.width / 2 - 10)
        let top = min(barFrame?.minY ?? safe.maxY, safe.maxY)
        let x = max(safe.minX + 8, min(center - frame.width / 2, safe.maxX - frame.width - 8))
        setFrameOrigin(NSPoint(x: x, y: max(safe.minY, top - frame.height - 8)))
    }

    @objc private func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        if isKeyWindow || frame.contains(NSEvent.mouseLocation) { lastInteraction = now }
        let elapsed = now - lastInteraction
        if elapsed >= 13 { dismissPanel(); return }
        alphaValue = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 1 : min(1, (13 - elapsed) / 10)
    }

    @objc private func copyCode() {
        NSPasteboard.general.clearContents()
        if NSPasteboard.general.setString(code, forType: .string) { copyButton.title = "Copied" }
        lastInteraction = ProcessInfo.processInfo.systemUptime
        alphaValue = 1
    }

    @objc func dismissPanel() {
        timer?.invalidate()
        timer = nil
        orderOut(nil)
        code = ""
        codeLabel.stringValue = ""
        codeLabel.setAccessibilityLabel(nil)
    }
}

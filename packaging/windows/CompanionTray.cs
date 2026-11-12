using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.7")]

internal sealed class CompanionTray : ApplicationContext
{
    private const string Title = "Brightspace Context";
    private const string SetupGuideUrl = "https://brightspace-context.khin101.chatgpt.site/setup/";
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunName = "BrightspaceContextCompanion";
    private readonly string startupCommand = "\"" + Application.ExecutablePath + "\" --background";
    private readonly EventWaitHandle activation;
    private readonly NotifyIcon icon;
    private readonly ToolStripMenuItem open;
    private readonly ToolStripMenuItem showCode;
    private readonly ToolStripMenuItem startup;
    private readonly System.Windows.Forms.Timer timer;
    private readonly Process worker;
    private readonly string token;
    private volatile string address;
    private volatile string pairingCode;
    private volatile string error;
    private bool openWhenReady;
    private bool exiting;
    private StartupNotice notice;

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool background = Array.IndexOf(args, "--background") >= 0;
        string identity = @"Local\BrightspaceContext." + Environment.UserName;
        using (var activate = new EventWaitHandle(false, EventResetMode.AutoReset, identity + ".Activate"))
        using (var instance = new Mutex(false, identity))
        {
            try
            {
                if (!instance.WaitOne(0))
                {
                    if (!background) activate.Set();
                    return;
                }
            }
            catch (AbandonedMutexException) { }
            try { using (var tray = new CompanionTray(activate, background)) Application.Run(tray); }
            catch (Exception ex) { MessageBox.Show(ex.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error); }
            finally { instance.ReleaseMutex(); }
        }
    }

    private CompanionTray(EventWaitHandle activation, bool background)
    {
        this.activation = activation;
        openWhenReady = !background;
        var bytes = new byte[32];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        token = BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();

        string root = AppDomain.CurrentDomain.BaseDirectory;
        var start = new ProcessStartInfo
        {
            FileName = Path.Combine(root, @"runtime\node.exe"),
            Arguments = "companion\\start.js --tray",
            WorkingDirectory = Path.Combine(root, "app"),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.EnvironmentVariables["BRIGHTSPACE_MANAGEMENT_TOKEN"] = token;
        worker = new Process { StartInfo = start };
        worker.OutputDataReceived += delegate(object sender, DataReceivedEventArgs data)
        {
            var line = data.Data ?? "";
            var ready = Regex.Match(line, @"^Address: (http://127\.0\.0\.1:[0-9]+)$");
            var code = Regex.Match(line, @"^Pairing code: ([a-f0-9]{10})$");
            if (ready.Success) address = ready.Groups[1].Value;
            if (code.Success) pairingCode = code.Groups[1].Value;
        };
        worker.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs data)
        {
            if (!String.IsNullOrWhiteSpace(data.Data)) error = data.Data;
        };
        worker.Start();
        worker.BeginOutputReadLine();
        worker.BeginErrorReadLine();

        var menu = new ContextMenuStrip();
        open = new ToolStripMenuItem("Open controls", null, delegate { ShowControls(); }) { Enabled = false };
        showCode = new ToolStripMenuItem("Show pairing code", null, delegate { ShowPairingCode(); }) { Enabled = false };
        startup = new ToolStripMenuItem("Launch at sign-in", null, delegate { ToggleStartup(); });
        menu.Items.Add(open);
        menu.Items.Add(showCode);
        menu.Items.Add("Setup guide", null, delegate { OpenInBrowser(SetupGuideUrl); });
        menu.Items.Add(startup);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit companion", null, delegate { ExitThread(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripLabel("Version " + Application.ProductVersion));
        menu.Opening += delegate { startup.Checked = StartupEnabled(); };
        var trayIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        icon = new NotifyIcon { Icon = trayIcon, Text = Title + " (starting)", ContextMenuStrip = menu, Visible = true };
        icon.DoubleClick += delegate { ShowControls(); };
        bool announcedReady = false;
        timer = new System.Windows.Forms.Timer { Interval = 300 };
        timer.Tick += delegate
        {
            if (worker.HasExited)
            {
                // A modal dialog pumps messages. Stop polling before showing a startup error.
                timer.Stop();
                if (address == null || pairingCode == null)
                    MessageBox.Show(error ?? "The companion could not start. Open the verbose shortcut for diagnostics.", Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                ExitThread();
                return;
            }
            if (activation.WaitOne(0)) openWhenReady = true;
            if (address == null || pairingCode == null) return;
            bool firstReady = !announcedReady;
            if (firstReady)
            {
                announcedReady = true;
                open.Enabled = true;
                showCode.Enabled = true;
                icon.Text = Title + " (running)";
            }
            if (openWhenReady) ShowControls();
            if (firstReady) ShowPairingCode();
        };
        timer.Start();
    }

    private void ShowPairingCode()
    {
        if (pairingCode == null) return;
        if (notice != null) notice.Close();
        notice = new StartupNotice(pairingCode);
        notice.FormClosed += delegate { notice = null; };
        notice.Show();
    }

    private void ShowControls()
    {
        if (address == null) { openWhenReady = true; return; }
        openWhenReady = false;
        OpenInBrowser(address + "/manage/#" + token);
    }

    private static void OpenInBrowser(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) { MessageBox.Show(ex.Message, Title); }
    }

    private bool StartupEnabled()
    {
        using (var key = Registry.CurrentUser.OpenSubKey(RunKey))
            return key != null && String.Equals(key.GetValue(RunName) as string, startupCommand, StringComparison.OrdinalIgnoreCase);
    }

    private void ToggleStartup()
    {
        try
        {
            bool enabled = StartupEnabled();
            using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (enabled) key.DeleteValue(RunName, false);
                else key.SetValue(RunName, startupCommand);
            }
            startup.Checked = !enabled;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    protected override void ExitThreadCore()
    {
        if (exiting) return;
        exiting = true;
        timer.Stop();
        if (notice != null) notice.Close();
        if (!worker.HasExited)
        {
            try { worker.StandardInput.Close(); } catch (IOException) { }
            if (!worker.WaitForExit(5000))
                try { worker.Kill(); } catch (InvalidOperationException) { }
        }
        icon.Visible = false;
        icon.ContextMenuStrip.Dispose();
        icon.Dispose();
        timer.Dispose();
        worker.Dispose();
        base.ExitThreadCore();
    }
}

internal sealed class StartupNotice : Form
{
    private const int CardRadius = 14;
    private const int SlideDuration = 180;
    private const int InitialNoticeDelay = 3000;
    private const int NoticeDuration = 10000;
    private const uint GetClientAreaAnimation = 0x1042;
    private readonly System.Windows.Forms.Timer dismissTimer;
    private readonly System.Windows.Forms.Timer frameTimer;
    private readonly Stopwatch slide = new Stopwatch();
    private readonly Stopwatch noticeAge = new Stopwatch();
    private readonly IntPtr taskbar;
    private readonly bool animate;
    private readonly bool rounded;
    private readonly double idleOpacity;
    private readonly Color outline;
    private readonly Font headingFont;
    private readonly Font codeFont;
    private readonly Font actionFont;
    private Rectangle visibleArea;
    private double hiddenAmount;
    private double openStart = 1;
    private double dismissStart;
    private double dismissOpacity;
    private bool interacting;
    private Dismissal dismissal;

    private enum Dismissal { None, Automatic, Manual }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowRect
    {
        public int Left, Top, Right, Bottom;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string className, string windowName);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out WindowRect rectangle);

    [DllImport("user32.dll")]
    private static extern bool SystemParametersInfo(uint action, uint parameter, out int value, uint flags);

    internal StartupNotice(string code)
    {
        Text = "Brightspace Context pairing code";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        taskbar = FindWindow("Shell_TrayWnd", null);
        var trayScreen = taskbar == IntPtr.Zero ? Screen.FromPoint(Cursor.Position) : Screen.FromHandle(taskbar);
        // Select the taskbar's monitor before Windows creates the DPI-aware window.
        Location = new Point(trayScreen.WorkingArea.Left, trayScreen.WorkingArea.Top);
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = SystemFonts.MessageBoxFont;
        Padding = new Padding(1);

        bool highContrast = SystemInformation.HighContrast;
        rounded = !highContrast;
        idleOpacity = highContrast ? 1 : .88;
        int animationSetting;
        animate = SystemParametersInfo(GetClientAreaAnimation, 0, out animationSetting, 0) && animationSetting != 0;
        hiddenAmount = animate ? 1 : 0;
        Opacity = idleOpacity * (1 - hiddenAmount);
        bool dark = false;
        if (!highContrast)
        {
            using (var theme = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
                dark = theme != null && Object.Equals(theme.GetValue("AppsUseLightTheme"), 0);
        }
        BackColor = highContrast ? SystemColors.Window : dark ? Color.FromArgb(31, 31, 35) : Color.FromArgb(247, 247, 249);
        ForeColor = highContrast ? SystemColors.WindowText : dark ? Color.FromArgb(238, 238, 241) : Color.FromArgb(36, 36, 40);
        outline = highContrast ? SystemColors.WindowText : dark ? Color.FromArgb(60, 60, 68) : Color.FromArgb(215, 215, 223);
        var muted = highContrast ? ForeColor : dark ? Color.FromArgb(176, 176, 187) : Color.FromArgb(98, 98, 108);
        var inset = highContrast ? BackColor : dark ? Color.FromArgb(22, 22, 25) : Color.FromArgb(239, 239, 242);
        var accent = dark ? Color.FromArgb(194, 162, 255) : Color.FromArgb(101, 67, 163);
        var accentSurface = dark ? Color.FromArgb(51, 39, 71) : Color.FromArgb(238, 232, 247);
        var hover = dark ? Color.FromArgb(43, 43, 49) : Color.FromArgb(231, 231, 237);
        headingFont = new Font(Font.FontFamily, Font.Size + 3, FontStyle.Bold);
        codeFont = new Font("Consolas", Font.Size + 4, FontStyle.Bold);
        actionFont = new Font(Font, FontStyle.Bold);

        var content = new TableLayoutPanel
        {
            AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Dock = DockStyle.Fill,
            ColumnCount = 1, Padding = new Padding(18, 14, 18, 14), BackColor = Color.Transparent
        };
        content.Controls.Add(new Label
        {
            Text = "Brightspace Context is running", AutoSize = true,
            ForeColor = muted, Margin = new Padding(0, 0, 0, 7)
        });
        content.Controls.Add(new Label
        {
            Text = "Pairing code", AutoSize = true, Font = headingFont, Margin = new Padding(0, 0, 0, 5)
        });
        var codeLabel = new Label
        {
            Text = code, AutoSize = true, Font = codeFont, BackColor = inset,
            Padding = new Padding(9, 4, 9, 4), Margin = new Padding(0, 0, 0, 7)
        };
        if (!highContrast) RoundCorners(codeLabel, 7);
        content.Controls.Add(codeLabel);
        content.Controls.Add(new Label
        {
            Text = "Enter this code in the Chrome extension.", AutoSize = true,
            ForeColor = muted, Margin = new Padding(0, 0, 0, 11)
        });

        var actions = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = Padding.Empty };
        Button copy = highContrast ? new Button() : new NoticeButton(BackColor, accentSurface, accent, hover, accent);
        copy.Text = "Copy code";
        copy.AutoSize = true;
        copy.MinimumSize = new Size(92, 33);
        copy.Padding = new Padding(5, 0, 5, 0);
        copy.Margin = new Padding(0, 0, 6, 0);
        copy.Font = actionFont;
        Button dismiss = highContrast ? new Button() : new NoticeButton(BackColor, BackColor, ForeColor, hover, accent);
        dismiss.Text = "Dismiss";
        dismiss.AutoSize = true;
        dismiss.MinimumSize = new Size(76, 33);
        dismiss.Margin = Padding.Empty;
        actions.Controls.Add(copy);
        actions.Controls.Add(dismiss);
        copy.Click += delegate
        {
            try { Clipboard.SetText(code); copy.Text = "Copied"; }
            catch (System.Runtime.InteropServices.ExternalException) { copy.Text = "Try again"; }
        };
        dismiss.Click += delegate { DismissNotice(Dismissal.Manual); };
        CancelButton = dismiss;
        content.Controls.Add(actions);
        Controls.Add(content);

        dismissTimer = new System.Windows.Forms.Timer();
        dismissTimer.Tick += delegate
        {
            UpdateInteraction();
            if (!interacting) DismissNotice(Dismissal.Automatic);
        };
        frameTimer = new System.Windows.Forms.Timer { Interval = 15 };
        frameTimer.Tick += delegate { UpdateFrame(); };
    }

    private sealed class NoticeButton : Button
    {
        private readonly Color fill, hover, focus;

        internal NoticeButton(Color surface, Color fill, Color text, Color hover, Color focus)
        {
            BackColor = surface;
            ForeColor = text;
            this.fill = fill;
            this.hover = hover;
            this.focus = focus;
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            bool hovered = ClientRectangle.Contains(PointToClient(MousePosition));
            e.Graphics.Clear(BackColor);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var path = RoundedPath(this, 8, .5f))
            using (var brush = new SolidBrush(hovered ? hover : fill))
                e.Graphics.FillPath(brush, path);
            if (Focused && ShowFocusCues)
            {
                float inset = 2f * DeviceDpi / 96;
                using (var path = RoundedPath(this, 6, inset))
                using (var pen = new Pen(focus, Math.Max(1f, DeviceDpi / 96f)))
                    e.Graphics.DrawPath(pen, path);
            }
            TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, ForeColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
        }
    }

    private static GraphicsPath RoundedPath(Control control, int radius, float inset)
    {
        var path = new GraphicsPath();
        float width = control.ClientSize.Width - 2 * inset;
        float height = control.ClientSize.Height - 2 * inset;
        float diameter = Math.Min(2f * radius * control.DeviceDpi / 96, Math.Min(width, height));
        if (diameter <= 0) return path;
        path.AddArc(inset, inset, diameter, diameter, 180, 90);
        path.AddArc(inset + width - diameter, inset, diameter, diameter, 270, 90);
        path.AddArc(inset + width - diameter, inset + height - diameter, diameter, diameter, 0, 90);
        path.AddArc(inset, inset + height - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void RoundCorners(Control control, int radius)
    {
        EventHandler update = delegate
        {
            using (var path = RoundedPath(control, radius, 0))
                if (path.PointCount > 0) control.Region = new Region(path);
        };
        control.SizeChanged += update;
        update(control, EventArgs.Empty);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        base.OnPaintBackground(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var pen = new Pen(outline))
        {
            if (!rounded)
                e.Graphics.DrawRectangle(pen, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
            else
                using (var path = RoundedPath(this, CardRadius, .5f))
                    e.Graphics.DrawPath(pen, path);
        }
        e.Graphics.SmoothingMode = SmoothingMode.Default;
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        PlaceAtTaskbar();
    }

    protected override void OnShown(EventArgs e)
    {
        // AutoSize can change the final bounds after Load, especially above 100% scaling.
        PlaceAtTaskbar();
        noticeAge.Start();
        if (animate) slide.Start();
        else frameTimer.Interval = 50;
        frameTimer.Start();
        UpdateInteraction();
        if (!interacting) StartDismissTimer();
        base.OnShown(e);
    }

    private void UpdateInteraction()
    {
        if (dismissal == Dismissal.Manual) return;
        Point pointer = PointToClient(MousePosition);
        bool hovering = ClientRectangle.Contains(pointer) && (Region == null || Region.IsVisible(pointer));
        bool active = hovering || (ContainsFocus && ShowFocusCues);
        if (interacting == active) return;
        interacting = active;
        if (interacting)
        {
            dismissTimer.Stop();
            if (dismissal == Dismissal.Automatic)
            {
                dismissal = Dismissal.None;
                openStart = hiddenAmount;
                slide.Restart();
                frameTimer.Interval = 15;
            }
        }
        else if (dismissal == Dismissal.None) StartDismissTimer();
    }

    private void StartDismissTimer()
    {
        dismissTimer.Interval = animate
            ? (int)Math.Max(SlideDuration, InitialNoticeDelay - noticeAge.ElapsedMilliseconds)
            : NoticeDuration;
        dismissTimer.Start();
    }

    private void DismissNotice(Dismissal reason)
    {
        if (dismissal == Dismissal.Manual || dismissal == reason) return;
        if (!animate) { Close(); return; }
        dismissTimer.Stop();
        dismissal = reason;
        dismissStart = hiddenAmount;
        dismissOpacity = Opacity;
        slide.Restart();
        frameTimer.Interval = 15;
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        dismissTimer.Stop();
        frameTimer.Stop();
        slide.Stop();
        base.OnFormClosed(e);
    }

    private void UpdateFrame()
    {
        UpdateInteraction();
        double opacity = interacting ? 1 : idleOpacity;
        if (slide.IsRunning)
        {
            int duration = dismissal == Dismissal.Automatic ? NoticeDuration - SlideDuration : SlideDuration;
            double elapsed = slide.Elapsed.TotalMilliseconds;
            double progress = Math.Min(1, elapsed / duration);
            if (dismissal == Dismissal.None)
                hiddenAmount = openStart * Math.Pow(1 - progress, 3);
            else
            {
                // Keep the popup in reach through most of the automatic fade.
                double movement = Math.Max(0, (Math.Min(duration, elapsed) - duration + SlideDuration) / SlideDuration);
                hiddenAmount = dismissStart + (1 - dismissStart) * movement * movement;
                opacity = dismissOpacity * (1 - progress);
            }
            if (progress >= 1)
            {
                slide.Stop();
                if (dismissal != Dismissal.None) { Close(); return; }
                frameTimer.Interval = 50;
            }
        }
        PlaceAtTaskbar();
        if (dismissal == Dismissal.None && !interacting) opacity *= 1 - hiddenAmount;
        if (Opacity != opacity) Opacity = opacity;
    }

    private void PlaceAtTaskbar()
    {
        var screen = taskbar == IntPtr.Zero ? Screen.FromControl(this) : Screen.FromHandle(taskbar);
        Rectangle area = screen.WorkingArea;
        Rectangle monitor = screen.Bounds;
        DockStyle edge = DockStyle.Bottom;
        WindowRect bar;
        if (GetWindowRect(taskbar, out bar))
        {
            // The live rectangle tracks an auto-hidden taskbar as it moves.
            if (bar.Right - bar.Left >= bar.Bottom - bar.Top)
            {
                bool top = bar.Top + bar.Bottom < monitor.Top + monitor.Bottom;
                edge = top ? DockStyle.Top : DockStyle.Bottom;
                if (top) area.Intersect(Rectangle.FromLTRB(monitor.Left, Math.Max(monitor.Top, bar.Bottom), monitor.Right, monitor.Bottom));
                else area.Intersect(Rectangle.FromLTRB(monitor.Left, monitor.Top, monitor.Right, Math.Min(monitor.Bottom, bar.Top)));
            }
            else
            {
                bool left = bar.Left + bar.Right < monitor.Left + monitor.Right;
                edge = left ? DockStyle.Left : DockStyle.Right;
                if (left) area.Intersect(Rectangle.FromLTRB(Math.Max(monitor.Left, bar.Right), monitor.Top, monitor.Right, monitor.Bottom));
                else area.Intersect(Rectangle.FromLTRB(monitor.Left, monitor.Top, Math.Min(monitor.Right, bar.Left), monitor.Bottom));
            }
        }

        int gap = (int)Math.Round(8 * DeviceDpi / 96.0);
        int offset = (int)Math.Round(28 * DeviceDpi / 96.0 * hiddenAmount);
        int x = Math.Max(area.Left, area.Right - Width - gap);
        int y = Math.Max(area.Top, area.Bottom - Height - gap);
        switch (edge)
        {
            case DockStyle.Top: y = area.Top - offset; break;
            case DockStyle.Bottom: y = Math.Max(area.Top, area.Bottom - Height) + offset; break;
            case DockStyle.Left: x = area.Left - offset; break;
            case DockStyle.Right: x = Math.Max(area.Left, area.Right - Width) + offset; break;
        }

        area.Offset(-x, -y);
        Rectangle clip = Rectangle.Intersect(ClientRectangle, area);
        if (clip != visibleArea)
        {
            visibleArea = clip;
            using (var path = RoundedPath(this, CardRadius, 0))
            {
                var region = rounded && path.PointCount > 0 ? new Region(path) : new Region(ClientRectangle);
                region.Intersect(clip);
                Region = region;
            }
        }
        if (Left != x || Top != y) Location = new Point(x, y);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && dismissTimer != null) dismissTimer.Dispose();
        if (disposing && frameTimer != null) frameTimer.Dispose();
        base.Dispose(disposing);
        if (disposing)
        {
            if (headingFont != null) headingFont.Dispose();
            if (codeFont != null) codeFont.Dispose();
            if (actionFont != null) actionFont.Dispose();
        }
    }
}
